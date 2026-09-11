import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function verifyRazorpaySignature(body: string, signature: string, secret: string) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify', 'sign']
  );
  
  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(body)
  );
  
  const hashArray = Array.from(new Uint8Array(signatureBuffer));
  const expectedSignature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return expectedSignature === signature;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const signature = req.headers.get('x-razorpay-signature');
    if (!signature) {
      throw new Error("Missing signature");
    }

    const secret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');
    if (!secret) {
      throw new Error("Webhook secret not configured");
    }

    const rawBody = await req.text();
    const isValid = await verifyRazorpaySignature(rawBody, signature, secret);

    if (!isValid) {
      throw new Error("Invalid signature");
    }

    const payload = JSON.parse(rawBody);

    if (payload.event !== 'payment.captured') {
      return new Response(JSON.stringify({ status: "ignored" }), { headers: corsHeaders });
    }

    const paymentEntity = payload.payload.payment.entity;
    const rzpOrderId = paymentEntity.order_id;
    const rzpPaymentId = paymentEntity.id;
    const eventId = req.headers.get('x-razorpay-event-id') || payload.event_id || rzpPaymentId;
    const amountInPaise = paymentEntity.amount;
    const amountInRupees = amountInPaise / 100;

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id')
      .eq('payment_intent_id', rzpOrderId)
      .single();

    if (orderError || !order) {
      throw new Error("Order not found for this payment intent");
    }

    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('resolve_external_payment', {
      p_order_id: order.id,
      p_transaction_id: rzpPaymentId,
      p_amount: amountInRupees,
      p_idempotency_key: eventId
    });

    if (rpcError) {
      console.error("RPC Error:", rpcError);
      throw new Error(rpcError.message);
    }

    return new Response(JSON.stringify({ status: "success" }), { headers: corsHeaders });
  } catch (error) {
    console.error("Webhook processing error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: corsHeaders,
      status: 400
    });
  }
});
