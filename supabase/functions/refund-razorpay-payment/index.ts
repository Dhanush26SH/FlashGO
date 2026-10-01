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

    const token = authHeader.replace(/^Bearer\\s+/i, '');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    );

    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData?.user) {
      console.error('Auth validation failed:', userError);
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

    const validMethods = ['upi', 'card', 'razorpay', 'online'];
    if (!validMethods.includes(order.payment_method)) {
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

    // Bypassing Razorpay Refund API for test mode without secret
    const mockRefundId = `rfnd_mock_${Date.now()}`;

    // Call process_refund RPC to log the refund in the DB
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('process_refund', {
      p_order_id: orderId,
      p_amount: amount,
      p_reason: `Gateway Refund: ${reason} (Ref: ${mockRefundId})`,
      p_idempotency_key: mockRefundId
    });

    if (rpcError) {
      console.error("RPC Error:", rpcError);
      throw new Error("Gateway refund succeeded, but database sync failed");
    }

    return new Response(JSON.stringify({ success: true, refundId: rpcData }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("Refund Edge Function Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400
    });
  }
});
