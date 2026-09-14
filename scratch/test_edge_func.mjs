import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNjg2NjAsImV4cCI6MjA5NDk0NDY2MH0.m6ZZLat8I6sbvTcrB-dEN6cQio3hPIlUmEkxles3O6c';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testWithOrder() {
  const { data: authData } = await supabase.auth.signInWithPassword({
    email: 'testcustomer@flashgo.in',
    password: 'password123',
  });

  // Let's create an order or get an order id directly
  // We will invoke create-razorpay-order with a dummy or real orderId
  console.log("Invoking create-razorpay-order with non-existent orderId:");
  let res = await supabase.functions.invoke('create-razorpay-order', {
    body: { orderId: '00000000-0000-0000-0000-000000000000', amount: 100 }
  });
  console.log("Response Data:", res.data);
  console.log("Response Error:", res.error);
  if (res.error && res.error.context) {
    console.log("Raw context response:", await res.error.context.text());
  }
}

testWithOrder();
