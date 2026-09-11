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

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !userData.user) {
      throw new Error("Unauthorized");
    }
    const customerId = userData.user.id;

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: order, error: orderError } = await supabaseClient
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .eq('customer_id', customerId)
      .single();

    if (orderError || !order) {
      throw new Error("Order not found or access denied");
    }

    if (!['upi', 'card'].includes(order.payment_method)) {
      throw new Error(`Order payment method (${order.payment_method}) is not external`);
    }
    if (order.payment_status !== 'pending') {
      throw new Error(`Order payment status (${order.payment_status}) is not pending`);
    }
    
    const keyId = Deno.env.get('RAZORPAY_KEY_ID');
    const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET');
    if (!keyId || !keySecret) {
      throw new Error("Razorpay credentials not configured");
    }

    const amountInPaise = Math.round(order.total_amount * 100);
    const basicAuth = btoa(`${keyId}:${keySecret}`);

    const razorpayRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${basicAuth}`
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency: "INR",
        receipt: orderId.substring(0, 40)
      })
    });

    if (!razorpayRes.ok) {
      const errorText = await razorpayRes.text();
      console.error("Razorpay Error:", errorText);
      throw new Error("Failed to create Razorpay order");
    }

    const rzpOrder = await razorpayRes.json();

    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({ payment_intent_id: rzpOrder.id })
      .eq('id', orderId);

    if (updateError) {
      throw new Error("Failed to map order to payment intent");
    }

    return new Response(JSON.stringify({
      keyId,
      orderId: rzpOrder.id,
      amount: amountInPaise,
      currency: "INR",
      internalOrderId: orderId
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400
    });
  }
});
