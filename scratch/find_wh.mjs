import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNjg2NjAsImV4cCI6MjA5NDk0NDY2MH0.m6ZZLat8I6sbvTcrB-dEN6cQio3hPIlUmEkxles3O6c';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function findWarehouse() {
  await supabase.auth.signInWithPassword({
    email: 'testcustomer@flashgo.in',
    password: 'password123',
  });

  const { data: addresses } = await supabase
    .from('customer_addresses')
    .select('*')
    .limit(5);

  console.log("Customer Addresses:", addresses);

  const { data: warehouses, error } = await supabase
    .from('warehouses')
    .select('id, name, lat, lng, service_radius_km')
    .limit(5);

  console.log("Warehouses:", warehouses, error);
}

findWarehouse();
