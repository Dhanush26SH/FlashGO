import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNjg2NjAsImV4cCI6MjA5NDk0NDY2MH0.m6ZZLat8I6sbvTcrB-dEN6cQio3hPIlUmEkxles3O6c';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkRecentOrders() {
  const { data, error } = await supabase
    .from('orders')
    .select('id, status, payment_status, payment_method, total_amount, created_at, customer_id')
    .order('created_at', { ascending: false })
    .limit(5);

  console.log("Recent Orders:", JSON.stringify(data, null, 2));
  console.log("Error if any:", error);
}

checkRecentOrders();
