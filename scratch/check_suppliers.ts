import * as fs from 'fs';
const data = JSON.parse(fs.readFileSync('C:\\Users\\dhanu\\FlashGO\\scratch\\excel_data.json', 'utf8'));
const suppliers = data['Supplier Master Proposal'];
console.log(suppliers[0]);
