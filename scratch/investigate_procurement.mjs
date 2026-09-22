import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';

const adminClient = createClient(supabaseUrl, supabaseServiceKey);

async function investigate() {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);

  console.log(`Querying POs from ${startDate.toISOString()} to ${endDate.toISOString()}`);

  const { data, error } = await adminClient
    .from('procurement_orders')
    .select(`
      id,
      created_at,
      status,
      total_cost,
      warehouse_id,
      vendor_id,
      warehouses ( name ),
      vendors ( name )
    `)
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching POs:', error);
    return;
  }

  let totalAll = 0;
  let totalApproved = 0;

  console.log(`\nFound ${data.length} POs in the date range:`);
  console.log('--------------------------------------------------');

  data.forEach(po => {
    const cost = Number(po.total_cost || 0);
    totalAll += cost;
    
    let includedInDetail = po.status === 'approved';
    if (includedInDetail) {
      totalApproved += cost;
    }

    console.log(`PO ID: ${po.id}`);
    console.log(`Supplier: ${po.vendors?.name}`);
    console.log(`Warehouse: ${po.warehouses?.name}`);
    console.log(`Status: ${po.status}`);
    console.log(`Created At: ${po.created_at}`);
    console.log(`Total Cost: ₹${cost}`);
    console.log(`In Detail Sheet?: ${includedInDetail ? 'YES' : 'NO'} (Reason: status is ${po.status})`);
    console.log('--------------------------------------------------');
  });

  console.log('\n--- SUMMARY ---');
  console.log(`Total Spend (All Statuses - like Exec Summary): ₹${totalAll}`);
  console.log(`Total Spend (Approved Only - like Detail Sheet): ₹${totalApproved}`);
  console.log(`Discrepancy: ₹${totalAll - totalApproved}`);
}

investigate().catch(console.error);
