import * as fs from 'fs';

const data = JSON.parse(fs.readFileSync('C:\\Users\\dhanu\\FlashGO\\scratch\\excel_data.json', 'utf8'));

const mappings = data['Product Supplier Mapping'].filter(m => m.product_id && m.supplier_name);
console.log(`Valid mappings count: ${mappings.length}`);
if (mappings.length > 0) {
  console.log("Sample mapping:", mappings[0]);
} else {
  const allMappings = data['Product Supplier Mapping'];
  console.log("Total rows in mapping sheet:", allMappings.length);
  console.log("First row:", allMappings[0]);
}
