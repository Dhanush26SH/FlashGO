const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const orderId = '1889f10c-0143-4f92-9b93-d1d5f2563526';
  
  const { data: order, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();
    
  if (error) {
    console.error('Error fetching order:', error);
    return;
  }
  
  console.log('Order found:', order);
  
  if (order.status !== 'cancelled' && order.status !== 'delivered') {
    const { data: updateData, error: updateError } = await supabase
      .from('orders')
      .update({ status: 'cancelled' })
      .eq('id', orderId)
      .select();
      
    if (updateError) {
      console.error('Error cancelling order:', updateError);
    } else {
      console.log('Order cancelled successfully:', updateData);
    }
  } else {
    console.log('Order is already closed/cancelled');
  }
  
  // Also check if there are trips for this order
  const { data: tripOrders, error: toError } = await supabase
    .from('trip_orders')
    .select('trip_id')
    .eq('order_id', orderId);
    
  if (!toError && tripOrders && tripOrders.length > 0) {
    console.log('Found associated trips:', tripOrders);
    for (const to of tripOrders) {
      const { data: trip, error: tripError } = await supabase
        .from('trips')
        .select('*')
        .eq('id', to.trip_id)
        .single();
      console.log('Trip:', trip);
      if (trip && trip.status !== 'completed' && trip.status !== 'cancelled') {
        const { error: cancelTripErr } = await supabase
          .from('trips')
          .update({ status: 'cancelled' })
          .eq('id', trip.id);
        if (cancelTripErr) console.error('Error cancelling trip:', cancelTripErr);
        else console.log('Cancelled trip:', trip.id);
      }
    }
  }
}

main();
