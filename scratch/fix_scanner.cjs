const fs = require('fs');
let code = fs.readFileSync('mobile-staff/src/screens/Warehouse/InwardDamageWorkflow.tsx', 'utf-8');

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
                  {isVerified && (
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
                  <View style={styles.inputsContainer}>
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

                    {!isVerified ? (
                      <TouchableOpacity 
                        style={[styles.scanBtn, !inp.supplier_dispatch_batch_id && { opacity: 0.5, backgroundColor: '#94a3b8' }]}
                        disabled={!inp.supplier_dispatch_batch_id}
                        onPress={() => handleScanProduct(item.id)}
                      >
                        <Camera color="#fff" size={16} />
                        <Text style={styles.scanBtnText}>
                          {inp.supplier_dispatch_batch_id ? "Verify FLH" : "Select Batch First"}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <>
                        <Text style={styles.scannedBarcodeLabel}>Scanned FLH: {verifiedItems[item.id]}</Text>
                        
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
                    )}
                  </View>
                )}
              </View>
            );
`;

const regex = /if \(remaining <= 0\) return null;[\s\S]*?<\/View>\n\s*\);\n\s*\}/;
code = code.replace(regex, newItemCardJSX + '\\n          }');

fs.writeFileSync('mobile-staff/src/screens/Warehouse/InwardDamageWorkflow.tsx', code);
