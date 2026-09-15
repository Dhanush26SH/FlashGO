const fs = require('fs');
let code = fs.readFileSync('src/views/Admin/modules/ProcurementSupplier.tsx', 'utf-8');

// 1. Add dispatchBatches to state
code = code.replace(
  /const \[dispatchInputs, setDispatchInputs\] = useState<Record<string, { batch_number: string, expiry_date: string, accepted_quantity: number, rejected_quantity: number }>>\({}\);/,
  'const [dispatchInputs, setDispatchInputs] = useState<Record<string, { batch_number: string, expiry_date: string, dispatched_quantity: number }[]>>({});\n  const [existingDispatches, setExistingDispatches] = useState<any[]>([]);'
);

// 2. Replace promptReceiveStock and confirmReceiveStock logic
const newMethods = `
  const promptDispatchDetails = async (po: ProcurementOrder) => {
    setDispatchingPO(po);
    const inputs: Record<string, { batch_number: string, expiry_date: string, dispatched_quantity: number }[]> = {};
    if (po.items) {
      po.items.forEach(i => {
        inputs[i.product_id] = [];
      });
    }
    
    try {
      const existing = await ProcurementService.getSupplierDispatchBatches(po.id);
      setExistingDispatches(existing);
    } catch (e: any) {
      addToast('Failed to load existing dispatches', 'error');
      setExistingDispatches([]);
    }
    setDispatchInputs(inputs);
  };

  const confirmDispatchDetails = async () => {
    if (!dispatchingPO) return;
    
    const submissions: any[] = [];
    if (dispatchingPO.items) {
      for (const item of dispatchingPO.items) {
        const itemInputs = dispatchInputs[item.product_id] || [];
        for (const input of itemInputs) {
          if (!input.batch_number || !input.dispatched_quantity || input.dispatched_quantity <= 0) {
            addToast('Batch number and valid dispatched quantity are required for all entries', 'error');
            return;
          }
          submissions.push({
            poItemId: item.id,
            productId: item.product_id,
            batchNumber: input.batch_number,
            expiryDate: input.expiry_date || null,
            dispatchedQuantity: input.dispatched_quantity
          });
        }
      }
    }

    if (submissions.length === 0) {
      addToast('Please add at least one dispatch batch', 'error');
      return;
    }

    try {
      for (const sub of submissions) {
        await ProcurementService.adminRecordSupplierDispatch(
          dispatchingPO.id,
          sub.poItemId,
          sub.productId,
          sub.batchNumber,
          sub.dispatchedQuantity,
          sub.expiryDate
        );
      }
      addToast('Supplier dispatch recorded successfully', 'success');
      setDispatchingPO(null);
    } catch (err: any) {
      addToast(\`Failed to record dispatch: \${err.message}\`, 'error');
    }
  };
`;

code = code.replace(/const promptReceiveStock =[\s\S]*?catch \(err: any\) \{\s*addToast\(\`Failed to receive stock: \$\{err\.message\}\`, 'error'\);\s*\}\s*\};/g, newMethods);

// 3. Replace 'promptReceiveStock' calls with 'promptDispatchDetails' and change button text
code = code.replace(/promptReceiveStock\(r as any\)/g, 'promptDispatchDetails(r as any)');
code = code.replace(/<CheckCircle size=\{12\}\/> Inward/g, '<Package size={12}/> Dispatch Details');

fs.writeFileSync('src/views/Admin/modules/ProcurementSupplier.tsx', code);
