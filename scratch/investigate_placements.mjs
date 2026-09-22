import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';
const adminClient = createClient(supabaseUrl, supabaseServiceKey);

async function investigate() {
    console.log('--- Checking RPCs referencing warehouse_product_placements ---');
    try {
        const { data } = await adminClient.rpc('execute_sql', {
            sql: `
                SELECT p.proname 
                FROM pg_proc p 
                JOIN pg_namespace n ON p.pronamespace = n.oid 
                WHERE n.nspname = 'public' 
                AND pg_get_functiondef(p.oid) ILIKE '%warehouse_product_placements%';
            `
        });
        console.log('RPCs:', data);
    } catch(e) {}
}

investigate().catch(console.error);
