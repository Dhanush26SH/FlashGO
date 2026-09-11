import * as fs from 'fs';

const data = JSON.parse(fs.readFileSync('C:\\Users\\dhanu\\FlashGO\\scratch\\excel_data.json', 'utf8'));

console.log('Supplier Master Proposal:');
for (const s of data['Supplier Master Proposal']) {
  console.log(`- ${s.supplier_name}: ${s.contact_person || ''} | Re-use existing PureDairy? ${s.reuse_existing === 'PureDairy Co.' ? 'YES' : 'NO'}`);
}

console.log('\nProduct Supplier Mapping Sample (first 5):');
console.log(data['Product Supplier Mapping'].slice(0, 5).map((r: any) => ({
  product_id: r.product_id,
  product_name: r.product_name,
  supplier_name: r.supplier_name,
  minimum_order_quantity: r.minimum_order_quantity,
  verified_purchase_price: r.verified_purchase_price
})));

console.log('\nSummary Sheet:');
console.log(data['Summary']);
