import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';
const adminClient = createClient(supabaseUrl, supabaseKey);

async function checkRLS() {
  const { data, error } = await adminClient.rpc('get_tables_without_rls');
  
  if (error) {
      console.error(error);
      return;
  }
  
  console.log("ALL TABLES in public:");
  console.table(data);
  
  const disabled = data.filter((t: any) => !t.rls_enabled);
  console.log("\nTABLES WITH RLS DISABLED:");
  if (disabled.length === 0) {
      console.log("None!");
  } else {
      console.table(disabled);
  }
}

checkRLS().catch(console.error);
