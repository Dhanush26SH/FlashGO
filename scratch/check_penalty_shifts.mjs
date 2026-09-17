import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const env = Object.fromEntries(fs.readFileSync('.env', 'utf-8').split('\n').filter(Boolean).map(l => l.split('=')));
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY);

async function run() {
  const driverId = 'c886c5b1-8d41-4b71-8ab9-095d4a24fbad';
  
  const { data: ledger, error: err1 } = await adminClient
    .from('driver_financial_ledger')
    .select('*')
    .eq('driver_id', driverId)
    .eq('transaction_type', 'penalty');
    
  if (err1) console.error(err1);

  const refIds = ledger.map(l => l.source_reference_id).filter(Boolean);
  
  const { data: shifts, error: err2 } = await adminClient
    .from('staff_shifts')
    .select('*')
    .in('id', refIds);
    
  if (err2) console.error(err2);

  console.log("Shifts corresponding to penalties:");
  console.log(shifts);
}

run();
