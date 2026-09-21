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
      throw new Error("orderId is required");
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error("Missing Authorization header");
    }

    const token = authHeader.replace(/^Bearer\s+/i, '');
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData?.user) {
      throw new Error("Unauthorized");
    }
    const customerId = userData.user.id;

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify ownership and fetch payment_intent_id
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .eq('customer_id', customerId)
      .single();

    if (orderError || !order) {
      throw new Error("Order not found or access denied");
    }

    if (order.status !== 'payment_pending' && order.payment_status !== 'pending') {
      // If it's already resolved, just return paid if it's placed, or failed
      if (order.status === 'placed' || order.payment_status === 'paid') {
        return new Response(JSON.stringify({ status: "paid" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }});
      }
      return new Response(JSON.stringify({ status: order.status }), { headers: { ...corsHeaders, "Content-Type": "application/json" }});
    }

    const paymentIntentId = order.payment_intent_id;
    if (!paymentIntentId) {
      return new Response(JSON.stringify({ status: "pending" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }});
    }

    const keyId = Deno.env.get('RAZORPAY_KEY_ID');
    const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET');
    if (!keyId || !keySecret) {
      throw new Error("Razorpay credentials not configured");
    }

    // Reconcile via Razorpay API
    const basicAuth = btoa(`${keyId}:${keySecret}`);
    const rzpResponse = await fetch(`https://api.razorpay.com/v1/orders/${paymentIntentId}/payments`, {
      headers: {
        'Authorization': `Basic ${basicAuth}`
      }
    });

    if (!rzpResponse.ok) {
      console.error("Razorpay API error:", await rzpResponse.text());
      // If Razorpay API fails, conservatively return pending
      return new Response(JSON.stringify({ status: "pending" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }});
    }

    const rzpData = await rzpResponse.json();
    const payments = rzpData.items || [];

    // Find a strictly 'captured' payment
    const capturedPayment = payments.find((p: any) => p.status === 'captured');

    if (capturedPayment) {
      const amountInRupees = capturedPayment.amount / 100;
      
      const { error: rpcError } = await supabaseAdmin.rpc('resolve_external_payment', {
        p_order_id: orderId,
        p_transaction_id: capturedPayment.id,
        p_amount: amountInRupees,
        p_idempotency_key: capturedPayment.id
      });

      if (rpcError) {
        console.error("RPC Error:", rpcError);
        throw new Error(rpcError.message);
      }

      return new Response(JSON.stringify({ status: "paid" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }});
    }

    return new Response(JSON.stringify({ status: "pending" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }});
    
  } catch (error: any) {
    console.error("Reconciliation error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400
    });
  }
});
