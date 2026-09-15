const fs = require('fs');
let code = fs.readFileSync('src/views/Admin/modules/ProcurementSupplier.tsx', 'utf-8');

const newModal = `
      {/* Dispatch Details Modal */}
      {dispatchingPO && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(3px)'
        }}>
          <div className="glass-panel" style={{
            padding: '32px', borderRadius: '16px', maxWidth: '800px', width: '90%', maxHeight: '80vh', overflowY: 'auto',
            backgroundColor: 'var(--bg-base)', boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
            border: '1px solid var(--border-light)',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '24px', color: 'var(--text-primary)', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Package size={20} color="var(--primary)" />
              Dispatch Details (PO #{dispatchingPO.id.slice(-6).toUpperCase()})
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginBottom: '24px' }}>
              {dispatchingPO.items?.map((item, idx) => {
                const prod = products.find(p => p.id === item.product_id);
                const inputs = dispatchInputs[item.product_id] || [];
                
                // Calculate already dispatched from existing
                const existingForItem = existingDispatches.filter(d => d.procurement_order_item_id === item.id);
                const alreadyDispatched = existingForItem.reduce((sum, d) => sum + d.dispatched_quantity, 0);
                const remaining = item.quantity - alreadyDispatched;

                return (
                  <div key={idx} style={{ padding: '16px', border: '1px solid var(--border-light)', borderRadius: '8px', backgroundColor: 'var(--bg-surface)' }}>
                    <div style={{ fontWeight: 700, marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px' }}>
                      <span style={{ fontSize: '1.1rem' }}>{prod?.name || item.product_id}</span>
                      <div style={{ display: 'flex', gap: '16px', fontSize: '0.85rem' }}>
                        <span>Ordered: <strong>{item.quantity}</strong></span>
                        <span>Already Dispatched: <strong style={{ color: 'var(--primary)' }}>{alreadyDispatched}</strong></span>
                        <span>Remaining: <strong style={{ color: remaining > 0 ? 'var(--warning)' : 'var(--success)' }}>{remaining}</strong></span>
                      </div>
                    </div>
                    
                    {existingForItem.length > 0 && (
                      <div style={{ marginBottom: '16px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        <div style={{ fontWeight: 600, marginBottom: '4px' }}>Previously Recorded Batches:</div>
                        {existingForItem.map(d => (
                          <div key={d.id} style={{ display: 'flex', gap: '16px', padding: '4px 0' }}>
                            <span style={{ fontFamily: 'monospace' }}>{d.batch_number}</span>
                            <span>Qty: {d.dispatched_quantity}</span>
                            <span>Exp: {d.expiry_date || 'N/A'}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {remaining > 0 ? (
                      <div>
                        {inputs.map((input, i) => (
                          <div key={i} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '12px', alignItems: 'flex-end' }}>
                            <div className="form-group" style={{ flex: 1, minWidth: '150px', marginBottom: 0 }}>
                              <label className="label">Batch Number</label>
                              <input className="input" value={input.batch_number} onChange={e => {
                                const newInputs = [...inputs];
                                newInputs[i].batch_number = e.target.value;
                                setDispatchInputs({...dispatchInputs, [item.product_id]: newInputs});
                              }} placeholder="e.g. BAT-001" />
                            </div>
                            <div className="form-group" style={{ flex: 1, minWidth: '150px', marginBottom: 0 }}>
                              <label className="label">Expiry Date</label>
                              <input className="input" type="date" value={input.expiry_date} onChange={e => {
                                const newInputs = [...inputs];
                                newInputs[i].expiry_date = e.target.value;
                                setDispatchInputs({...dispatchInputs, [item.product_id]: newInputs});
                              }} />
                            </div>
                            <div className="form-group" style={{ flex: 1, minWidth: '120px', marginBottom: 0 }}>
                              <label className="label" style={{ color: 'var(--primary)' }}>Dispatch Qty</label>
                              <input className="input" type="number" min={1} max={remaining} value={input.dispatched_quantity || ''} onChange={e => {
                                const newInputs = [...inputs];
                                newInputs[i].dispatched_quantity = Number(e.target.value);
                                setDispatchInputs({...dispatchInputs, [item.product_id]: newInputs});
                              }} required />
                            </div>
                            <button className="btn-secondary" style={{ padding: '8px 12px', height: '42px' }} onClick={() => {
                              const newInputs = inputs.filter((_, idx) => idx !== i);
                              setDispatchInputs({...dispatchInputs, [item.product_id]: newInputs});
                            }}><Trash size={16} /></button>
                          </div>
                        ))}
                        
                        <button className="btn-secondary" style={{ fontSize: '0.8rem', padding: '6px 12px', marginTop: '8px' }} onClick={() => {
                          setDispatchInputs({...dispatchInputs, [item.product_id]: [...inputs, { batch_number: '', expiry_date: '', dispatched_quantity: 0 }]});
                        }}>+ Add Another Batch</button>
                      </div>
                    ) : (
                      <div style={{ color: 'var(--success)', fontWeight: 600, fontSize: '0.9rem' }}>
                        Fully dispatched.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button className="btn-secondary" onClick={() => setDispatchingPO(null)}>Cancel</button>
              <button className="btn-primary" onClick={confirmDispatchDetails}>Record Dispatch Details</button>
            </div>
          </div>
        </div>
      )}
`;

code = code.replace(/\{\/\* Receiving Modal \*\/\}(.|\n)*?\{\/\* Catalog Modal \*\/\}/g, newModal + '\n      {/* Catalog Modal */}');

fs.writeFileSync('src/views/Admin/modules/ProcurementSupplier.tsx', code);
