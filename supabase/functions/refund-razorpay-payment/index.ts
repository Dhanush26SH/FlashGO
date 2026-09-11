import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { orderId, amount, reason } = await req.json();
    if (!orderId || !amount || !reason) {
      throw new Error("Missing required fields");
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error("Missing Authorization header");
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !userData.user) {
      throw new Error("Unauthorized");
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify caller role from authoritative profiles table
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .single();

    if (profileError || !profile || profile.role !== 'admin') {
      throw new Error("Unauthorized: Only admins can initiate refunds");
    }

    // Fetch order securely using admin client to prevent RLS bypasses
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('*, payment_transactions!inner(*)')
      .eq('id', orderId)
      .eq('payment_transactions.status', 'paid')
      .single();

    if (orderError || !order) {
      throw new Error("Paid order not found");
    }

    if (!['upi', 'card'].includes(order.payment_method)) {
      throw new Error("Payment method is not external gateway");
    }

    const paymentTx = order.payment_transactions[0];
    if (!paymentTx || !paymentTx.transaction_id) {
      throw new Error("No external transaction ID found for this order");
    }

    // Never trust client amount beyond the legitimately refundable amount
    if (amount > paymentTx.amount) {
      throw new Error(`Refund amount (${amount}) exceeds total paid amount (${paymentTx.amount})`);
    }

    const keyId = Deno.env.get('RAZORPAY_KEY_ID');
    const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET');
    if (!keyId || !keySecret) {
      throw new Error("Razorpay credentials not configured");
    }

    const basicAuth = btoa(`${keyId}:${keySecret}`);
    const amountInPaise = Math.round(amount * 100);

    // Call Razorpay Refund API
    const rzpRes = await fetch(`https://api.razorpay.com/v1/payments/${paymentTx.transaction_id}/refund`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${basicAuth}`
      },
      body: JSON.stringify({
        amount: amountInPaise,
        receipt: `ref_${orderId.substring(0, 15)}`
      })
    });

    if (!rzpRes.ok) {
      const errorText = await rzpRes.text();
      console.error("Razorpay Refund Error:", errorText);
      throw new Error("Failed to process Razorpay refund");
    }

    const refundData = await rzpRes.json();

    // Call process_refund RPC to log the refund in the DB
    // We use the supabaseClient so it runs in the context of the requesting user
    // Wait, the RPC allows authorized users. We can call it directly with supabaseClient.
    const { data: rpcData, error: rpcError } = await supabaseClient.rpc('process_refund', {
      p_order_id: orderId,
      p_amount: amount,
      p_reason: `Gateway Refund: ${reason} (Ref: ${refundData.id})`,
      p_idempotency_key: refundData.id
    });

    if (rpcError) {
      console.error("RPC Error:", rpcError);
      throw new Error("Gateway refund succeeded, but database sync failed");
    }

    return new Response(JSON.stringify({ success: true, refundId: rpcData }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Refund Edge Function Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400
    });
  }
});
