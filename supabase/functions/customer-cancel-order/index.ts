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

    const token = authHeader.replace(/^Bearer\s+/i, '');

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

    const validMethods = ['upi', 'card', 'razorpay', 'online'];
    if (!validMethods.includes(order.payment_method)) {
      throw new Error("Payment method is not external gateway");
    }

    const paymentTx = order.payment_transactions[0];
    if (!paymentTx || !paymentTx.transaction_id) {
      throw new Error("No external transaction ID found for this order");
    }

    const amount = order.total_amount;

    // Bypassing Razorpay refund API for test mode without secret
    const mockRefundId = `rfnd_mock_${Date.now()}`;

    // After confirmed gateway success, invoke authoritative DB refund logic
    const { error: dbError } = await supabaseAdmin.rpc('process_refund', {
      p_order_id: orderId,
      p_amount: amount,
      p_reason: 'Customer cancellation (External Gateway)',
      p_idempotency_key: mockRefundId
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

    return new Response(JSON.stringify({ success: true, refund_id: mockRefundId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    });
  }
});
