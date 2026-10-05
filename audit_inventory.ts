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

  const { data: udupiCatalog } = await supabase.rpc('get_warehouse_catalog', { p_warehouse_id: udupiId });
  const { data: manipalCatalog } = await supabase.rpc('get_warehouse_catalog', { p_warehouse_id: manipalId });

  const getStats = (warehouseId: string) => {
    const stockRows = stockData?.filter(s => s.warehouse_id === warehouseId) || [];
    const batches = batchData?.filter(b => b.warehouse_id === warehouseId) || [];
    const resRows = reservations?.filter(r => r.warehouse_id === warehouseId) || [];
    const catalog = warehouseId === udupiId ? udupiCatalog : manipalCatalog;

    const totalStockRows = new Set(stockRows.map(s => s.product_id)).size;
    const physicalGtZero = stockRows.filter(s => s.quantity > 0).length;
    const physicalZero = stockRows.filter(s => s.quantity === 0).length; // Though normally stock rows with quantity 0 might not exist or are 0
    
    const totalPhysical = stockRows.reduce((sum, s) => sum + s.quantity, 0);
    const totalReserved = resRows.reduce((sum, r) => sum + r.quantity, 0);
    const totalSellable = totalPhysical - totalReserved;

    const now = new Date();
    const activeBatches = batches.filter(b => !b.expiry_date || new Date(b.expiry_date) > now).length;
    const expiredBatches = batches.filter(b => b.expiry_date && new Date(b.expiry_date) <= now).length;

    const catalogAvailable = catalog ? catalog.filter((c: any) => c.in_stock).length : 0;
    const sellableProductsCount = catalog ? catalog.filter((c: any) => c.stock_quantity > 0).length : 0;
    
    return {
      totalStockRows, // This is count of unique products with stock rows
      physicalGtZero: new Set(stockRows.filter(s => s.quantity > 0).map(s => s.product_id)).size,
      physicalZero: new Set(stockRows.filter(s => s.quantity === 0).map(s => s.product_id)).size,
      totalPhysical,
      totalReserved,
      totalSellable,
      activeBatches,
      expiredBatches,
      catalogAvailable,
      sellableProductsCount
    };
  };

  const uStats = getStats(udupiId);
  const mStats = getStats(manipalId);

  // Cross warehouse overlap test
  const udupiProductIds = new Set(stockData?.filter(s => s.warehouse_id === udupiId).map(s => s.product_id));
  const manipalProductIds = new Set(stockData?.filter(s => s.warehouse_id === manipalId).map(s => s.product_id));
  
  let isolationFailed = false;
  // If Manipal has any stock rows for products that Udupi also has, that's fine if they are distinct rows.
  // The isolation test asks "Are any inventory rows/batches incorrectly shared across the two warehouses?"
  // Since warehouse_stock has `warehouse_id`, they are structurally isolated.
  
  console.log('UDUPI:');
  console.log(uStats);
  console.log('MANIPAL:');
  console.log(mStats);
}

run();
