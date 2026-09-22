const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function run() {
  const { data, error } = await supabase.rpc('admin_get_financial_export_data', {
    p_start_date: '2026-09-01T00:00:00Z',
    p_end_date: '2026-09-30T23:59:59Z',
    p_warehouse_id: null
  });

  if (error) {
    console.error('Error:', error);
  } else {
    console.log(JSON.stringify({
      revenue_by_date: data.revenue_by_date?.length,
      warehouse_performance: data.warehouse_performance?.length,
      orders: data.orders?.length,
    }, null, 2));
    
    if (data.revenue_by_date?.length) {
      console.log('Sample revenue_by_date row:', data.revenue_by_date[0]);
    }
  }
}

run();
