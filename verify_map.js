const fs = require('fs');

const md = fs.readFileSync('C:/Users/dhanu/.gemini/antigravity-ide/brain/eda67385-29b3-4be3-a272-031114e0e8bd/final_product_category_repair_map.md', 'utf-8');
const lines = md.split('\\n');
const rows = lines.filter(l => l.startsWith('|') && !l.includes('Product ID') && !l.includes('---|---'));

let counts = {};
let distinctIds = new Set();
let correctBefore = 0;
let requiringChange = 0;

for (let r of rows) {
  const parts = r.split('|').map(s => s.trim());
  if (parts.length < 6) continue;
  
  const id = parts[1];
  const name = parts[3];
  const curCat = parts[4];
  const tgtCat = parts[5];
  
  distinctIds.add(id);
  
  counts[tgtCat] = (counts[tgtCat] || 0) + 1;
  
  if (curCat === tgtCat) correctBefore++;
  else requiringChange++;
}

console.log(`Total Rows: ${rows.length}`);
console.log(`Distinct IDs: ${distinctIds.size}`);
console.log(`Correct Before: ${correctBefore}`);
console.log(`Requiring Change: ${requiringChange}`);

console.log('\\nCategory Distribution:');
for (const [cat, count] of Object.entries(counts).sort((a,b) => b[1] - a[1])) {
  console.log(`${cat}: ${count}`);
}
