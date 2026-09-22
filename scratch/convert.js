const fs = require('fs');
const content = fs.readFileSync('scratch/schema_columns.json', 'utf16le');
fs.writeFileSync('scratch/schema_columns_utf8.json', content, 'utf8');
