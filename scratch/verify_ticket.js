const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://szpfuommfvrfdliloxcg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
  const { data, error } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('related_order_id', '135be040-3ed0-4ab4-9e20-3086bb698678')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}
check();
