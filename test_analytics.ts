import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testAnalytics() {
  console.log('--- START ANALYTICS CLOSURE TEST ---');
  
  // 1. DATE VALIDATION TEST
  console.log('\n1. Date Validation (start > end)');
  try {
    const res = await supabase.rpc('get_product_performance', {
      p_start_date: '2026-09-02T00:00:00Z',
      p_end_date: '2026-09-01T00:00:00Z',
      p_warehouse_id: null
    });
    if (res.error) console.log('PASS: Date validation blocked:', res.error.message);
    else console.log('FAIL: Date validation bypassed');
  } catch(e) {
    console.log('PASS: Exception:', e);
  }

  // 2. WAREHOUSE ISOLATION & INVALID WAREHOUSE
  console.log('\n2. Warehouse Isolation');
  const invalidWh = '00000000-0000-0000-0000-000000000000';
  const whRes = await supabase.rpc('get_product_performance', {
    p_start_date: '2026-01-01T00:00:00Z',
    p_end_date: '2026-12-31T23:59:59Z',
    p_warehouse_id: invalidWh
  });
  if (whRes.data && whRes.data.length === 0) {
    console.log('PASS: Invalid warehouse returns empty dataset');
  } else {
    console.log('FAIL: Invalid warehouse returned data', whRes.data, whRes.error);
  }
  
  // 3. PRODUCT PERFORMANCE CALCULATION
  console.log('\n3. Product Performance Calculation');
  const prodRes = await supabase.rpc('get_product_performance', {
    p_start_date: '2026-01-01T00:00:00Z',
    p_end_date: '2026-12-31T23:59:59Z',
    p_warehouse_id: null
  });
  console.log('Product Performance length:', prodRes.data ? prodRes.data.length : prodRes.error);
  
  // 4. FINANCIAL EXPORT
  console.log('\n4. Financial Export');
  const finRes = await supabase.rpc('get_financial_ledger_export', {
    p_start_date: '2026-01-01T00:00:00Z',
    p_end_date: '2026-12-31T23:59:59Z',
    p_warehouse_id: null
  });
  console.log('Financial Export length:', finRes.data ? finRes.data.length : finRes.error);
  
  // 5. SALES TRENDS CUSTOM
  console.log('\n5. Sales Trends Custom');
  const salesRes = await supabase.rpc('get_sales_trends_custom', {
    p_start_date: '2026-01-01T00:00:00Z',
    p_end_date: '2026-12-31T23:59:59Z',
    p_warehouse_id: null
  });
  console.log('Sales Trends length:', salesRes.data ? salesRes.data.length : salesRes.error);
}

testAnalytics();
