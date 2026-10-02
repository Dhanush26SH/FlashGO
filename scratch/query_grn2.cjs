const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgres://postgres.szpfuommfvrfdliloxcg:flashgo-superuser-2026@aws-0-ap-south-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await client.connect();
    const res = await client.query(`
      SELECT 
        gr.id, 
        gr.receipt_number, 
        gr.created_at, 
        po.po_number, 
        v.name as supplier, 
        count(gri.id) as total_items, 
        sum(gri.quantity_received) as total_qty, 
        p.full_name as received_by,
        w.name as warehouse_name
      FROM goods_receipts gr 
      JOIN procurement_orders po ON gr.procurement_order_id = po.id 
      JOIN vendors v ON gr.vendor_id = v.id 
      LEFT JOIN goods_receipt_items gri ON gri.receipt_id = gr.id 
      JOIN profiles p ON gr.received_by = p.id 
      JOIN warehouses w ON gr.warehouse_id = w.id
      GROUP BY gr.id, po.po_number, v.name, p.full_name, w.name 
      LIMIT 2;
    `);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
