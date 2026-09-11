import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testCatalogBug() {
  console.log('--- START AUDIT ---');

  // 1. Authenticate
  let { data: { session } } = await supabase.auth.signInWithPassword({
    email: 'test@flashgo.com',
    password: 'password123'
  });
  if (!session) {
    console.error('Failed to get session');
    return;
  }
  const userId = session.user.id;
  console.log('1. User Authenticated:', userId);

  // 2. Fetch Active Address
  const { data: addresses, error: addrError } = await supabase
    .from('customer_addresses')
    .select('*')
    .eq('customer_id', userId)
    .order('is_default', { ascending: false });
    
  if (addrError) {
    console.error('Failed to get addresses', addrError);
  }
  
  let activeAddress = addresses && addresses.length > 0 ? addresses[0] : null;
  
  if (!activeAddress) {
    console.log('No addresses for user. Creating a dummy address at Manipal for testing...');
    const { data: newAddr, error: insertError } = await supabase
      .from('customer_addresses')
      .insert({
        customer_id: userId,
        address_line: 'Test Address', label: 'Home',
        lat: 13.3427,
        lng: 74.7472,
        is_default: true
      }).select().single();
      
    if (insertError) {
       console.error('Error creating dummy address', insertError);
       return;
    }
    activeAddress = newAddr;
  }
  console.log('2. Active Address:', { id: activeAddress.id, lat: activeAddress.lat, lng: activeAddress.lng });

  // 3. get_serving_warehouse
  const { data: warehouseId, error: whError } = await supabase.rpc('get_serving_warehouse', {
    p_lat: activeAddress.lat,
    p_lng: activeAddress.lng
  });
  
  if (whError) {
    console.error('get_serving_warehouse error:', whError);
  }
  console.log('3. Serving Warehouse ID:', warehouseId);
  
  if (!warehouseId) {
    console.log('No serving warehouse found for location.');
    return;
  }

  // 4. get_warehouse_catalog
  const { data: catalog, error: catError } = await supabase.rpc('get_warehouse_catalog', {
    p_warehouse_id: warehouseId,
    p_search_query: 'Milk'
  });
  
  if (catError) {
    console.error('get_warehouse_catalog error:', catError);
  }
  console.log(`4. get_warehouse_catalog returned ${catalog?.length || 0} products.`);
  
  if (catalog && catalog.length > 0) {
    console.log('Sample product:', catalog[0]);
  }
}

testCatalogBug();
