async function runSql() {
  const fetch = globalThis.fetch;
  const res = await fetch('https://api.supabase.com/v1/projects/szpfuommfvrfdliloxcg/database/query', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer sbp_ed0e10a1277a53248797e06d3a6f894a67b48254',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: `
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
    ` })
  });
  console.log('Status:', res.status);
  const text = await res.text();
  console.log(JSON.stringify(JSON.parse(text), null, 2));
}
runSql();
