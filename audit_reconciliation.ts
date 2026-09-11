import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://szpfuommfvrfdliloxcg.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  await supabase.auth.signInWithPassword({
    email: 'test_admin_1788638678169@example.com',
    password: 'Password123!'
  });

  const udupiId = '9f4d3149-f3e4-432b-98b6-f17af77c9c33';
  const manipalId = '76525a09-3fd1-4949-b45e-49c77255b4ce';

  const { data: stockData } = await supabase.from('warehouse_stock').select('*');
  const { data: batchData } = await supabase.from('product_batches').select('*');
  const { data: reservations } = await supabase.from('inventory_reservations').select('*').eq('status', 'reserved');
  const { data: ledgers } = await supabase.from('stock_ledger').select('warehouse_id');

  const now = new Date();

  // Udupi Stats
  const uStockRows = stockData?.filter(s => s.warehouse_id === udupiId) || [];
  const uBatches = batchData?.filter(b => b.warehouse_id === udupiId) || [];
  const uReservations = reservations?.filter(r => r.warehouse_id === udupiId) || [];

  let productsNoBatch = 0;
  let productsWithActiveBatch = 0;
  let productsWithExpiredBatch = 0;
  let expiredBatchRemainingQty = 0;
  let matchingProducts = 0;
  let mismatchingProducts = 0;
  let totalUdupiPhysical = 0;
  let totalAllBatches = 0;
  let totalActiveBatchesQty = 0;
  let safeActiveBatchDeltaNeeded = 0;

  for (const row of uStockRows) {
    const pId = row.product_id;
    const physicalQty = row.quantity;
    totalUdupiPhysical += physicalQty;

    const pBatches = uBatches.filter(b => b.product_id === pId);
    const activePBatches = pBatches.filter(b => !b.expiry_date || new Date(b.expiry_date) > now);
    const expiredPBatches = pBatches.filter(b => b.expiry_date && new Date(b.expiry_date) <= now);

    const allBatchesQty = pBatches.reduce((sum, b) => sum + b.available_quantity, 0);
    const activeBatchesQty = activePBatches.reduce((sum, b) => sum + b.available_quantity, 0);
    const expBatchesQty = expiredPBatches.reduce((sum, b) => sum + b.available_quantity, 0);

    totalAllBatches += allBatchesQty;
    totalActiveBatchesQty += activeBatchesQty;
    expiredBatchRemainingQty += expBatchesQty;

    if (pBatches.length === 0) productsNoBatch++;
    if (activePBatches.length > 0) productsWithActiveBatch++;
    if (expiredPBatches.length > 0) productsWithExpiredBatch++;

    if (physicalQty === allBatchesQty) {
      matchingProducts++;
    } else {
      mismatchingProducts++;
    }

    safeActiveBatchDeltaNeeded += (physicalQty - activeBatchesQty);
  }

  // Manipal Stats
  const mStockRows = stockData?.filter(s => s.warehouse_id === manipalId).length || 0;
  const mBatches = batchData?.filter(b => b.warehouse_id === manipalId).length || 0;
  const mReservations = reservations?.filter(r => r.warehouse_id === manipalId).length || 0;
  const mLedgers = ledgers?.filter(l => l.warehouse_id === manipalId).length || 0;

  console.log(`UDUPI PRODUCTS WITH NO BATCH: ${productsNoBatch}`);
  console.log(`UDUPI PRODUCTS WITH ACTIVE BATCH: ${productsWithActiveBatch}`);
  console.log(`UDUPI PRODUCTS WITH EXPIRED BATCH: ${productsWithExpiredBatch}`);
  console.log(`EXPIRED BATCH REMAINING QUANTITY: ${expiredBatchRemainingQty}`);
  console.log(`WAREHOUSE_STOCK VS ALL_BATCHES MATCHING PRODUCTS: ${matchingProducts}`);
  console.log(`WAREHOUSE_STOCK VS ALL_BATCHES MISMATCHING PRODUCTS: ${mismatchingProducts}`);
  console.log(`TOTAL UDUIPI WAREHOUSE PHYSICAL: ${totalUdupiPhysical}`);
  console.log(`TOTAL QUANTITY REPRESENTED BY ALL BATCHES: ${totalAllBatches}`);
  console.log(`TOTAL QUANTITY REPRESENTED BY ACTIVE BATCHES: ${totalActiveBatchesQty}`);
  console.log(`SAFE ACTIVE-BATCH DELTA NEEDED: ${safeActiveBatchDeltaNeeded}`);
  
  console.log('');
  console.log(`MANIPAL STOCK ROWS: ${mStockRows}`);
  console.log(`MANIPAL BATCHES: ${mBatches}`);
  console.log(`MANIPAL RESERVATIONS: ${mReservations}`);
  console.log(`MANIPAL LEDGERS: ${mLedgers}`);
}

run();
