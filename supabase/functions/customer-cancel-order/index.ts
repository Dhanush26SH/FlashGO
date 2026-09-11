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
    const { orderId } = await req.json();
    if (!orderId) {
      throw new Error("Missing orderId");
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

    // Verify ownership
    if (order.customer_id !== userData.user.id) {
      throw new Error("Unauthorized: You do not own this order");
    }

    // Verify status
    if (order.status !== 'placed') {
      throw new Error(`Order cannot be cancelled at this stage (status: ${order.status})`);
    }

    if (!['upi', 'card'].includes(order.payment_method)) {
      throw new Error("Payment method is not external gateway");
    }

    const paymentTx = order.payment_transactions[0];
    if (!paymentTx || !paymentTx.transaction_id) {
      throw new Error("No external transaction ID found for this order");
    }

    const amount = order.total_amount;

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
      const errRes = await rzpRes.json();
      throw new Error(errRes.error?.description || "Razorpay refund failed");
    }

    const rzpData = await rzpRes.json();

    // After confirmed gateway success, invoke authoritative DB refund logic
    const { error: dbError } = await supabaseAdmin.rpc('process_refund', {
      p_order_id: orderId,
      p_amount: amount,
      p_reason: 'Customer cancellation (External Gateway)',
      p_idempotency_key: rzpData.id
    });

    if (dbError) {
      throw new Error(`Refund logged at Razorpay but DB update failed: ${dbError.message}`);
    }

    // Update order status
    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({ status: 'cancelled', payment_status: 'refunded', updated_at: new Date().toISOString() })
      .eq('id', orderId);

    if (updateError) {
      throw updateError;
    }

    return new Response(JSON.stringify({ success: true, refund_id: rzpData.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    });
  }
});
