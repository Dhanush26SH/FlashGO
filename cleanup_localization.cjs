const fs = require('fs');
const path = require('path');

function replaceInFile(file, replacer) {
  const content = fs.readFileSync(file, 'utf8');
  const newContent = replacer(content);
  if (content !== newContent) {
    fs.writeFileSync(file, newContent, 'utf8');
    console.log(`Updated ${file}`);
  }
}

// Fix +1 in CustomerView
replaceInFile('src/views/Customer/CustomerView.tsx', c => c.replace(/\+1/g, '+91').replace(/\$ /g, '₹ '));

// Fix +1 in db.ts
replaceInFile('src/services/db.ts', c => {
  return c
    .replace(/\+1234567890/g, '+919876543210')
    .replace(/\+1987654321/g, '+919876543211')
    .replace(/\+1555555555/g, '+919876543212')
    .replace(/\+1444444444/g, '+919876543213')
    .replace(/\+1999999999/g, '+919876543214')
    .replace(/\+15550101/g, '+919876500101')
    .replace(/\+15550102/g, '+919876500102')
    .replace(/\+15550103/g, '+919876500103')
    .replace(/\+15550000/g, '+919876500000');
});

// Fix $ in ProductCatalog (Catalog Manager)
replaceInFile('src/views/Admin/modules/ProductCatalog.tsx', c => c.replace(/\(\$\)/g, '(₹)').replace(/\$ /g, '₹ '));

// Fix $ in FinanceSettlements
replaceInFile('src/views/Admin/modules/FinanceSettlements.tsx', c => c.replace(/\(\$\)/g, '(₹)').replace(/\$ /g, '₹ '));

// Fix $ in UserCouponWallet (Customer Wallet)
replaceInFile('src/views/Admin/modules/UserCouponWallet.tsx', c => c.replace(/\(\$\)/g, '(₹)').replace(/\$ /g, '₹ '));

// Fix $ in B2BProcurement (Procurement)
replaceInFile('src/views/Admin/modules/ProcurementSupplier.tsx', c => c.replace(/\(\$\)/g, '(₹)').replace(/\$ /g, '₹ '));
replaceInFile('src/views/Warehouse/WarehouseView.tsx', c => c.replace(/\(\$\)/g, '(₹)').replace(/\$ /g, '₹ '));

