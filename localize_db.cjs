const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'src', 'services', 'db.ts');
let content = fs.readFileSync(dbPath, 'utf8');

// 1. Multiply prices in products by roughly 80 for realism
// We can use a replacer function for price: \d+\.\d+
content = content.replace(/price:\s*([\d\.]+)/g, (match, p1) => {
  const newPrice = Math.round(parseFloat(p1) * 80);
  return `price: ${newPrice}`;
});
content = content.replace(/discount_price:\s*([\d\.]+)/g, (match, p1) => {
  const newPrice = Math.round(parseFloat(p1) * 80);
  return `discount_price: ${newPrice}`;
});
content = content.replace(/total_amount:\s*([\d\.]+)/g, (match, p1) => {
  const newPrice = Math.round(parseFloat(p1) * 80);
  return `total_amount: ${newPrice}`;
});
content = content.replace(/wallet_balance:\s*([\d\.]+)/g, (match, p1) => {
  const newPrice = Math.round(parseFloat(p1) * 80);
  return `wallet_balance: ${newPrice}`;
});
content = content.replace(/total_cost:\s*([\d\.]+)/g, (match, p1) => {
  const newPrice = Math.round(parseFloat(p1) * 80);
  return `total_cost: ${newPrice}`;
});

// 2. Change locations and ZIPs
content = content.replace(/New York/g, 'Mumbai');
content = content.replace(/Manhattan/g, 'Andheri');
content = content.replace(/Los Angeles/g, 'Bengaluru');
content = content.replace(/Brooklyn/g, 'Bandra');
content = content.replace(/NY 10001/g, 'MH 400001');
content = content.replace(/NY 10002/g, 'MH 400002');
content = content.replace(/CA 90001/g, 'KA 560001');
content = content.replace(/CA 90002/g, 'KA 560002');
content = content.replace(/NY/g, 'MH');
content = content.replace(/CA/g, 'KA');
content = content.replace(/ZIP/g, 'PIN');

// 3. Change Phone Numbers
content = content.replace(/\+1 555-010([0-9])/g, '+91 98765 0010$1');
content = content.replace(/\+1-555-([0-9]{4})/g, '+91-98765-$1');
content = content.replace(/\+1 \(\d{3}\) \d{3}-\d{4}/g, '+91 98765 12345');

// 4. Update Lat/Lng for Mumbai instead of NYC
// NYC is roughly 40.7, -74.0
// Mumbai is roughly 19.07, 72.87
content = content.replace(/lat:\s*40\.7[\d]+,\s*lng:\s*-74\.0[\d]+/g, 'lat: 19.0760, lng: 72.8777');
content = content.replace(/lat:\s*34\.0[\d]+,\s*lng:\s*-118\.2[\d]+/g, 'lat: 12.9716, lng: 77.5946');

fs.writeFileSync(dbPath, content, 'utf8');
console.log('Database mock data localized!');
