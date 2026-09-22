const fs = require('fs');
let text = fs.readFileSync('scratch/schema_columns_utf8.json', 'utf8');
if (text.charCodeAt(0) === 0xFEFF) {
  text = text.substring(1);
}
// Remove any text before the first {
const firstBrace = text.indexOf('{');
if (firstBrace > 0) text = text.substring(firstBrace);
const data = JSON.parse(text);

const tables = {};
for (const row of data.rows) {
  if (!tables[row.table_name]) tables[row.table_name] = [];
  tables[row.table_name].push(`${row.column_name} (${row.data_type})`);
}

let output = '';
for (const [table, columns] of Object.entries(tables)) {
  output += `TABLE: ${table}\n`;
  output += `  ${columns.join(', ')}\n\n`;
}

fs.writeFileSync('scratch/schema_summary.txt', output, 'utf8');
