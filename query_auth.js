import { createClient } from '@supabase/supabase-js';

const url = "https://szpfuommfvrfdliloxcg.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNjg2NjAsImV4cCI6MjA5NDk0NDY2MH0.m6ZZLat8I6sbvTcrB-dEN6cQio3hPIlUmEkxles3O6c";

const supabase = createClient(url, key);

async function run() {
  const accounts = [
    { email: 'admin@flashgo.in', password: 'password' },
    { email: 'admin@flashgo.in', password: 'password123' },
    { email: 'admin@flashgo.com', password: 'password' },
    { email: 'test@flashgo.in', password: 'password' },
    { email: 'driver@flashgo.in', password: 'password' },
    { email: 'driver1@flashgo.in', password: 'password123' },
    { email: 'driver1@flashgo.com', password: 'password' },
  ];

  let loggedIn = false;
  for (const acc of accounts) {
    const { data, error } = await supabase.auth.signInWithPassword(acc);
    if (!error) {
      console.log(`Logged in as ${acc.email}`);
      loggedIn = true;
      break;
    }
  }

  if (!loggedIn) {
    console.error("Could not log in to any account");
    return;
  }

  // 1. Fetch profiles to find Driver 1
  const { data: pData, error: pError } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .ilike('full_name', '%Driver%');

  if (pError) {
    console.error("Profiles error:", pError.message);
  } else {
    console.log("Found drivers:", pData);
    
    if (pData && pData.length > 0) {
      const driverId = pData.find(d => d.full_name === 'Driver 1' || d.full_name === 'Driver1')?.id || pData[0].id;
      
      const { data, error } = await supabase
        .from('driver_financial_ledger')
        .select('id, transaction_type, amount, occurred_at, description, metadata')
        .eq('driver_id', driverId)
        .order('occurred_at', { ascending: true });

      if (error) {
        console.error("Query error:", error.message);
      } else {
        console.log("LEDGER:");
        console.log(JSON.stringify(data, null, 2));
      }
    }
  }
}
run();
