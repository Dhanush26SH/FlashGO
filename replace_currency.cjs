const fs = require('fs');
const path = require('path');
function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        results.push(file);
      }
    }
  });
  return results;
}
const files = walk('./src');
let changedCount = 0;
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let newContent = content.replace(/\$([0-9])/g, '₹$1');
  newContent = newContent.replace(/\$\$\{/g, '₹${');
  newContent = newContent.replace(/ \$([A-Z0-9])/g, ' ₹$1');
  newContent = newContent.replace(/(\bPrice|\bCost|\bFee|\bBalance|\bAmount|\bEarned|\bEarnings|:)\s*\$/gi, '$1 ₹');
  newContent = newContent.replace(/\+\$/g, '+₹');
  newContent = newContent.replace(/\-\$/g, '-₹');
  newContent = newContent.replace(/\$ Flat/g, '₹ Flat');
  newContent = newContent.replace(/ \$([0-9])/g, ' ₹$1');
  newContent = newContent.replace(/per \$([0-9])/g, 'per ₹$1');
  newContent = newContent.replace(/Earn \$([0-9])/g, 'Earn ₹$1');
  newContent = newContent.replace(/AMOUNT \(\$\)/g, 'AMOUNT (₹)');
  newContent = newContent.replace(/FEE \(\$\)/g, 'FEE (₹)');
  
  if (content !== newContent) {
    fs.writeFileSync(file, newContent, 'utf8');
    changedCount++;
  }
});
console.log('Modified files:', changedCount);
