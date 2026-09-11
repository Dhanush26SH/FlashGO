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
  
  // Fix JSX dollar signs before curly braces: e.g. <span>${amount}</span>
  // We match >, space, or other characters indicating JSX text before ${
  content = content.replace(/([>\s\-\+•\(])\$\{/g, '$1₹{');
  
  // Fix cases where it's exactly `${...}` but might be at the start of a line (rare but possible)
  content = content.replace(/^(\s*)\$\{/gm, '$1₹{');
  
  // Also check for `\$${` which might have been missed
  content = content.replace(/\$\$\{/g, '₹${');
  
  // And fix any `$ ` in JSX text
  content = content.replace(/([>\s\-\+•\(])\$ /g, '$1₹ ');

  fs.writeFileSync(file, content, 'utf8');
});

console.log('Fixed remaining JSX dollar signs.');
