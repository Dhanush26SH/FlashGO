import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';

async function fetchOpenApi() {
  const response = await fetch(`${supabaseUrl}/rest/v1/`, {
    headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey
    }
  });
  const spec = await response.json();
  
  const tables = Object.keys(spec.components?.schemas || spec.definitions || {});
  console.log("Exposed Tables/Views:", tables);
}

fetchOpenApi().catch(console.error);
