const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNjg2NjAsImV4cCI6MjA5NDk0NDY2MH0.m6ZZLat8I6sbvTcrB-dEN6cQio3hPIlUmEkxles3O6c';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase
    .from('staff_shifts')
    .select('id, status, shift_start, shift_end, started_at, current_duty, warehouse_id')
    .eq('staff_id', '52dd620e-b6d8-4877-9caf-b3fb00877218')
    .eq('status', 'active');
  
  if (error) {
    console.error('Error:', error);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

run();
