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
      console.error("Auth error:", userError);
      throw new Error("Unauthorized");
    }
    const customerId = userData.user.id;

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .eq('customer_id', customerId)
      .single();

    if (orderError || !order) {
      console.error("Order fetch error:", orderError);
      throw new Error("Order not found or access denied");
    }

    const validMethods = ['upi', 'card', 'razorpay', 'online'];
    if (!validMethods.includes(order.payment_method)) {
      throw new Error(`Order payment method (${order.payment_method}) is not external`);
    }

    const validStatuses = ['pending', 'payment_pending'];
    if (!validStatuses.includes(order.payment_status)) {
      throw new Error(`Order payment status (${order.payment_status}) is not pending`);
    }
    
    const keyId = Deno.env.get('RAZORPAY_KEY_ID')?.trim();
    const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET')?.trim();

    if (!keyId || !keySecret) {
      console.error(`Razorpay configuration error: keyId exists: ${!!keyId}, keySecret exists: ${!!keySecret}`);
      throw new Error("Server configuration error");
    }

    const amountInPaise = Math.round(order.total_amount * 100);

    // Create a real Razorpay Order
    const basicAuth = btoa(`${keyId}:${keySecret}`);
    const rzpResponse = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency: "INR",
        receipt: orderId
      })
    });

    if (!rzpResponse.ok) {
      const errorText = await rzpResponse.text();
      const prefixMatch = keyId.match(/^(rzp_test_|rzp_live_)/);
      const prefix = prefixMatch ? prefixMatch[1] : "unknown_prefix";
      console.error(
        "Razorpay API error:",
        `HTTP Status: ${rzpResponse.status}`,
        `Response Body: ${errorText}`,
        `Request Amount: ${amountInPaise}`,
        `Currency: INR`,
        `Receipt: ${orderId}`,
        `keyId exists: ${!!keyId}`,
        `keySecret exists: ${!!keySecret}`,
        `key prefix: ${prefix}`
      );
      throw new Error("Failed to create Razorpay order");
    }

    const rzpData = await rzpResponse.json();
    const rzpOrderId = rzpData.id;

    // Persist real Razorpay order ID
    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({ payment_intent_id: rzpOrderId })
      .eq('id', orderId);

    if (updateError) {
      console.error("Update error:", updateError);
      throw new Error("Failed to map order to payment intent");
    }

    return new Response(JSON.stringify({
      keyId,
      orderId: rzpOrderId,
      amount: amountInPaise,
      currency: "INR",
      internalOrderId: orderId
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("create-razorpay-order catch error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400
    });
  }
});
