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

  const uStockRows = stockData?.filter(s => s.warehouse_id === udupiId) || [];
  const uBatches = batchData?.filter(b => b.warehouse_id === udupiId) || [];
  const mStockRows = stockData?.filter(s => s.warehouse_id === manipalId) || [];
  const mBatches = batchData?.filter(b => b.warehouse_id === manipalId) || [];

  const now = new Date();

  // Udupi
  const uTotalPhysical = uStockRows.reduce((s, r) => s + r.quantity, 0);
  const uActiveBatches = uBatches.filter(b => !b.expiry_date || new Date(b.expiry_date) > now);
  const uActiveQty = uActiveBatches.reduce((s, b) => s + b.available_quantity, 0);
  const uExpBatches = uBatches.filter(b => b.expiry_date && new Date(b.expiry_date) <= now);
  const uExpQty = uExpBatches.reduce((s, b) => s + b.available_quantity, 0);
  const uTotalBatchQty = uBatches.reduce((s, b) => s + b.available_quantity, 0);
  
  const uActiveProducts = new Set(uActiveBatches.map(b => b.product_id)).size;
  const uExpOnlyProducts = new Set(uExpBatches.map(b => b.product_id)).size;

  // Manipal
  const mTotalPhysical = mStockRows.reduce((s, r) => s + r.quantity, 0);
  const mActiveBatches = mBatches.filter(b => !b.expiry_date || new Date(b.expiry_date) > now);
  const mActiveQty = mActiveBatches.reduce((s, b) => s + b.available_quantity, 0);
  const mTotalBatchQty = mBatches.reduce((s, b) => s + b.available_quantity, 0);
  
  const mActiveProducts = new Set(mActiveBatches.map(b => b.product_id)).size;

  console.log(`--- UDUPI ---`);
  console.log(`warehouse_stock total physical: ${uTotalPhysical}`);
  console.log(`active/unexpired batch remaining total: ${uActiveQty}`);
  console.log(`expired batch remaining total: ${uExpQty}`);
  console.log(`all batch remaining total: ${uTotalBatchQty}`);
  console.log(`active-batch product count: ${uActiveProducts}`);
  console.log(`expired-only product count: ${uExpOnlyProducts}`);
  console.log(`confirm active + expired batch quantities = warehouse physical quantity: ${uActiveQty + uExpQty === uTotalPhysical}`);

  console.log(`\n--- MANIPAL ---`);
  console.log(`warehouse_stock total physical: ${mTotalPhysical}`);
  console.log(`active batch remaining total: ${mActiveQty}`);
  console.log(`active-batch product count: ${mActiveProducts}`);
  console.log(`confirm batch quantity = warehouse physical quantity: ${mTotalBatchQty === mTotalPhysical}`);
}

run();
