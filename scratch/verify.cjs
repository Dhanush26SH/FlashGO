const { execSync } = require('child_process');

function runQ(title, query) {
  console.log(`\n=== ${title} ===`);
  try {
    const res = execSync(`npx supabase db query --linked "${query}"`, { encoding: 'utf8' });
    // Strip "Initialising login role..."
    const clean = res.replace(/Initialising login role...\n/, '');
    console.log(clean);
  } catch (e) {
    console.error(e.stdout || e.stderr || e.message);
  }
}

const PO_ID = 'd76bd1d2-3ab0-478a-8a9c-96d1971050d3';
const PROD_ID = '44c85d6c-e21e-4c08-9328-13d699e66f12';
const WH_ID = 'd9de6374-5cb9-4eb0-941e-c0d80e47159b'; // Based on previous udupi warehouse

runQ("1. supplier_dispatch_batches", `SELECT batch_number, dispatched_quantity, received_quantity, (dispatched_quantity - received_quantity) as remaining FROM public.supplier_dispatch_batches WHERE procurement_order_id = '${PO_ID}'`);
runQ("2. PO", `SELECT status FROM public.procurement_orders WHERE id = '${PO_ID}'`);
runQ("2. PO Items", `SELECT quantity, received_quantity FROM public.procurement_order_items WHERE procurement_order_id = '${PO_ID}'`);
runQ("3. goods_receipts", `SELECT id, receipt_number, received_by FROM public.goods_receipts WHERE procurement_order_id = '${PO_ID}' ORDER BY created_at DESC LIMIT 1`);
runQ("3. GRN Items", `SELECT gri.* FROM public.goods_receipt_items gri JOIN public.goods_receipts gr ON gri.receipt_id = gr.id WHERE gr.procurement_order_id = '${PO_ID}' ORDER BY gr.created_at DESC LIMIT 1`);
runQ("4. warehouse_stock", `SELECT quantity, staging_quantity, reserved_quantity, (quantity - reserved_quantity) as available FROM public.warehouse_stock WHERE product_id = '${PROD_ID}'`);
runQ("5. product_batches", `SELECT batch_number, expiry_date, available_quantity, staging_quantity FROM public.product_batches WHERE product_id = '${PROD_ID}' ORDER BY created_at DESC LIMIT 1`);
runQ("6. putaway_tasks", `SELECT id, quantity, placed_quantity, (quantity - placed_quantity) as remaining, status, batch_id FROM public.putaway_tasks WHERE product_id = '${PROD_ID}' ORDER BY created_at DESC LIMIT 1`);
runQ("8. placements", `SELECT SUM(quantity) FROM public.warehouse_product_placements WHERE product_id = '${PROD_ID}'`);
runQ("10. staff_shifts", `SELECT current_duty, status FROM public.staff_shifts WHERE staff_id = (SELECT received_by FROM public.goods_receipts WHERE procurement_order_id = '${PO_ID}' ORDER BY created_at DESC LIMIT 1) ORDER BY created_at DESC LIMIT 1`);
