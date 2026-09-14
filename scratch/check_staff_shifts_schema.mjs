import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNjg2NjAsImV4cCI6MjA5NDk0NDY2MH0.m6ZZLat8I6sbvTcrB-dEN6cQio3hPIlUmEkxles3O6c';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspect() {
  // Sign in as admin
  const { data: auth, error } = await supabase.auth.signInWithPassword({
    email: 'dhanushshriyan91@gmail.com',
    password: 'password123'
  });
  if (error) {
    console.error('Auth error:', error);
    return;
  }
  console.log('Logged in as admin');

  const { data: shifts, error: shiftsErr } = await supabase
    .from('staff_shifts')
    .select('*')
    .limit(3);
  
  if (shifts && shifts.length > 0) {
    console.log('staff_shifts columns:', Object.keys(shifts[0]));
    console.log('Sample shift:', shifts[0]);
  } else {
    console.log('No shifts or error:', shiftsErr);
  }

  const { data: slots, error: slotsErr } = await supabase
    .from('work_slots')
    .select('*')
    .limit(3);
  
  if (slots && slots.length > 0) {
    console.log('work_slots columns:', Object.keys(slots[0]));
    console.log('Sample slot:', slots[0]);
  } else {
    console.log('No slots or error:', slotsErr);
  }
}

inspect();
