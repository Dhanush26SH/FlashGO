import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';
const adminClient = createClient(supabaseUrl, supabaseServiceKey);

async function investigate() {
    console.log('--- Checking FEFO picking logic ---');
    
    // We want to see how product_batches are fetched for FEFO
    let fns = null;
    try {
        const res = await adminClient.rpc('execute_sql', {
            sql: `
                SELECT p.proname, pg_get_functiondef(p.oid) as def
                FROM pg_proc p
                JOIN pg_namespace n ON p.pronamespace = n.oid
                WHERE p.proname ILIKE '%fefo%' OR p.proname ILIKE '%pick%' OR p.proname ILIKE '%allocate_stock%';
            `
        });
        fns = res.data;
    } catch (e) {}

    if (fns) {
        fns.forEach(fn => {
            console.log(`\nFunction: ${fn.proname}`);
            // look for expiry logic
            const lines = fn.def.split('\n');
            lines.forEach(l => {
                if (l.toLowerCase().includes('expiry') || l.toLowerCase().includes('status')) {
                    console.log(`  ${l.trim()}`);
                }
            });
        });
    }

    console.log('\n--- Checking status trigger on product_batches ---');
    let triggers = null;
    try {
        const res = await adminClient.rpc('execute_sql', {
            sql: `
                SELECT tgname, pg_get_triggerdef(oid) as def 
                FROM pg_trigger 
                WHERE tgrelid = 'public.product_batches'::regclass;
            `
        });
        triggers = res.data;
    } catch(e) {}
    
    if (triggers) {
        triggers.forEach(t => console.log(`Trigger: ${t.tgname}\nDef: ${t.def}`));
    }
}

investigate().catch(console.error);
