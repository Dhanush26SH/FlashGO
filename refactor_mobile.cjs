const fs = require('fs');
let code = fs.readFileSync('mobile-staff/src/screens/Warehouse/InwardDamageWorkflow.tsx', 'utf-8');

// 1. Update POItem interface
code = code.replace(
  /internal_barcode: string;\n  };\n}/,
  `internal_barcode: string;
  };
  supplier_dispatch_batches?: {
    id: string;
    batch_number: string;
    expiry_date: string | null;
    dispatched_quantity: number;
    received_quantity: number;
  }[];
}`
);

// 2. Update ReceivePayload
code = code.replace(
  /batch_number: string;\n  expiry_date: string;/,
  'supplier_dispatch_batch_id: string;'
);

// 3. Update fetchPOItems SQL to include supplier_dispatch_batches
code = code.replace(
  /product:products\(name, sku, internal_barcode\)/,
  'product:products(name, sku, internal_barcode),\n          supplier_dispatch_batches(id, batch_number, expiry_date, dispatched_quantity, received_quantity)'
);

// 4. Update initial input state
code = code.replace(
  /batch_number: '',\n          expiry_date: '',/,
  'supplier_dispatch_batch_id: \'\','
);

// 5. Update handleSubmit payload mapping
code = code.replace(
  /batch_number: inp\.batch_number \|\| null,\n        expiry_date: inp\.expiry_date \|\| null,/,
  'supplier_dispatch_batch_id: inp.supplier_dispatch_batch_id,'
);

// 6. Update JSX for Item Card
const newItemCardJSX = `
            if (remaining <= 0) return null; // Already fully received
            
            const batches = item.supplier_dispatch_batches || [];
            
            return (
              <View key={item.id} style={[styles.itemCard, isVerified && styles.itemCardVerified]}>
                <View style={styles.itemHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{item.product?.name}</Text>
                    <Text style={styles.itemSku}>SKU: {item.product?.sku} | Remaining: {remaining}</Text>
                  </View>
                  {!isVerified ? (
                    batches.length > 0 ? (
                      <TouchableOpacity style={styles.scanBtn} onPress={() => handleScanProduct(item.id)}>
                        <Camera color="#fff" size={16} />
                        <Text style={styles.scanBtnText}>Verify FLH</Text>
                      </TouchableOpacity>
                    ) : null
                  ) : (
                    <View style={styles.verifiedBadge}>
                      <Check color="#059669" size={16} />
                      <Text style={styles.verifiedText}>Verified</Text>
                    </View>
                  )}
                </View>
                
                {batches.length === 0 ? (
                  <View style={{ marginTop: 12, padding: 12, backgroundColor: '#fef3c7', borderRadius: 8, flexDirection: 'row', alignItems: 'center' }}>
                    <AlertTriangle color="#d97706" size={20} />
                    <Text style={{ marginLeft: 8, color: '#92400e', fontWeight: 'bold' }}>Awaiting supplier dispatch details</Text>
                  </View>
                ) : (
                  isVerified && (
                    <View style={styles.inputsContainer}>
                      <Text style={styles.scannedBarcodeLabel}>Scanned FLH: {verifiedItems[item.id]}</Text>
                      
                      <Text style={[styles.label, { marginTop: 12, marginBottom: 8 }]}>Select Supplier Dispatch Batch:</Text>
                      <View style={{ gap: 8, marginBottom: 16 }}>
                        {batches.map(b => {
                          const remainingBatch = b.dispatched_quantity - b.received_quantity;
                          if (remainingBatch <= 0) return null;
                          const isSelected = inp.supplier_dispatch_batch_id === b.id;
                          return (
                            <TouchableOpacity 
                              key={b.id} 
                              style={{ 
                                padding: 12, 
                                borderRadius: 8, 
                                borderWidth: 1, 
                                borderColor: isSelected ? '#10b981' : '#e2e8f0',
                                backgroundColor: isSelected ? '#ecfdf5' : '#fff'
                              }}
                              onPress={() => handleInputChange(item.id, 'supplier_dispatch_batch_id', b.id)}
                            >
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                <Text style={{ fontWeight: 'bold', color: isSelected ? '#047857' : '#334155' }}>Batch: {b.batch_number}</Text>
                                {isSelected && <Check color="#10b981" size={16} />}
                              </View>
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                <Text style={{ fontSize: 12, color: '#64748b' }}>Exp: {b.expiry_date || 'N/A'}</Text>
                                <Text style={{ fontSize: 12, color: '#64748b' }}>Qty Available: {remainingBatch} (of {b.dispatched_quantity})</Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      {inp.supplier_dispatch_batch_id ? (
                        <>
                          <View style={styles.row}>
                            <View style={styles.inputGroup}>
                              <Text style={styles.label}>Accepted Qty</Text>
                              <TextInput 
                                style={styles.input}
                                keyboardType="numeric"
                                value={inp.accepted_quantity}
                                onChangeText={(val) => handleInputChange(item.id, 'accepted_quantity', val)}
                              />
                            </View>
                          </View>
                          
                          <View style={styles.row}>
                            <View style={styles.inputGroup}>
                              <Text style={[styles.label, { color: '#f59e0b' }]}>Damaged Qty</Text>
                              <TextInput 
                                style={styles.input}
                                keyboardType="numeric"
                                value={inp.damaged_quantity}
                                onChangeText={(val) => handleInputChange(item.id, 'damaged_quantity', val)}
                              />
                            </View>
                            <View style={styles.inputGroup}>
                              <Text style={[styles.label, { color: '#ef4444' }]}>Expired Qty</Text>
                              <TextInput 
                                style={styles.input}
                                keyboardType="numeric"
                                value={inp.expired_quantity}
                                onChangeText={(val) => handleInputChange(item.id, 'expired_quantity', val)}
                              />
                            </View>
                          </View>
                          
                          <TouchableOpacity style={styles.rescanBtn} onPress={() => handleScanProduct(item.id)}>
                            <Text style={styles.rescanBtnText}>Rescan Barcode</Text>
                          </TouchableOpacity>
                        </>
                      ) : (
                        <Text style={{ color: '#ef4444', fontStyle: 'italic', marginBottom: 12 }}>Please select a batch to enter quantities.</Text>
                      )}
                    </View>
                  )
                )}
              </View>
            );
`;

code = code.replace(/if \(remaining <= 0\) return null;(.|\n)*?<\/View>\n\s*\);\n\s*\}/, newItemCardJSX + '\n          }');

fs.writeFileSync('mobile-staff/src/screens/Warehouse/InwardDamageWorkflow.tsx', code);
