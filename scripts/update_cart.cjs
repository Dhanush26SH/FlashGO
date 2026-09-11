const fs = require('fs');
let code = fs.readFileSync('src/views/Customer/CustomerView.tsx', 'utf8');

code = code.replace(
  /const \[paymentMethod, setPaymentMethod\] = useState<'card' \| 'cod'>\('card'\);/,
  "const [paymentMethod, setPaymentMethod] = useState<'wallet' | 'cod'>('wallet');\n  const [customerAddresses, setCustomerAddresses] = useState<any[]>([]);\n  const [selectedAddressId, setSelectedAddressId] = useState<string>('');\n\n  React.useEffect(() => {\n    if (isCartOpen && currentUser) {\n      import('../../services/api/AddressService').then(({ AddressService }) => {\n        AddressService.getAddresses(currentUser.id).then(addrs => {\n          setCustomerAddresses(addrs);\n          if (addrs.length > 0) setSelectedAddressId(addrs[0].id);\n        });\n      });\n    }\n  }, [isCartOpen, currentUser]);"
);

// update address in createOrder
code = code.replace(
  /const order = createOrder\(deliveryAddress, deliverySpeed, paymentMethod\);/,
  "const chosenAddr = customerAddresses.find(a => a.id === selectedAddressId)?.address_line || deliveryAddress;\n    const order = createOrder(chosenAddr, deliverySpeed, paymentMethod);"
);

// update card to wallet in finalTotal check
code = code.replace(
  /paymentMethod === 'card' && currentUser\.wallet_balance < finalTotal/g,
  "paymentMethod === 'wallet' && currentUser.wallet_balance < finalTotal"
);

// Replace the string 'card' with 'wallet' in the JSX
code = code.replace(/setPaymentMethod\('card'\)/g, "setPaymentMethod('wallet')");
code = code.replace(/paymentMethod === 'card'/g, "paymentMethod === 'wallet'");

// Inject address dropdown into cart UI
const addrSelectorHtml = `{customerAddresses.length > 0 ? (
                  <select 
                    value={selectedAddressId} 
                    onChange={e => setSelectedAddressId(e.target.value)}
                    style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', width: '100%', marginBottom: '12px' }}
                  >
                    {customerAddresses.map(a => <option key={a.id} value={a.id}>{a.label} - {a.address_line}</option>)}
                  </select>
                ) : (
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>Please add an address in your Profile to checkout properly. Using default.</div>
                )}`;

code = code.replace(
  /<div style=\{\{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', backgroundColor: 'var\(--bg-base\)', borderRadius: '6px', border: '1px solid var\(--border-light\)', marginBottom: '12px' \}\}>/g,
  addrSelectorHtml + "\n                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', backgroundColor: 'var(--bg-base)', borderRadius: '6px', border: '1px solid var(--border-light)', marginBottom: '12px' }}>"
);

fs.writeFileSync('src/views/Customer/CustomerView.tsx', code);
