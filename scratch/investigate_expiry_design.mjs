import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';
const adminClient = createClient(supabaseUrl, supabaseServiceKey);

async function investigate() {
    console.log('--- Checking tables for Location Stock ---');
    // Looking for location stock tables (e.g., putaway_placements, location_stock)
    let tables = null;
    try {
        const { data } = await adminClient.rpc('execute_sql', {
            sql: `
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND (table_name LIKE '%location%' OR table_name LIKE '%putaway%' OR table_name LIKE '%task%');
            `
        });
        tables = data;
    } catch (e) {
        console.log('Failed to fetch tables:', e);
    }
    console.log('Relevant tables:', tables);

    console.log('\n--- Checking adjust_batch_stock RPC ---');
    try {
        const { data } = await adminClient.rpc('execute_sql', {
            sql: `
                SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args, pg_get_functiondef(p.oid) as def
                FROM pg_proc p
                JOIN pg_namespace n ON p.pronamespace = n.oid
                WHERE n.nspname = 'public' AND p.proname = 'adjust_batch_stock';
            `
        });
        if (data && data.length > 0) {
            console.log(`RPC adjust_batch_stock found:`);
            console.log(`Args: ${data[0].args}`);
            // don't print full def to save space, just snippet
            console.log(data[0].def.substring(0, 500) + '...');
        } else {
            console.log('adjust_batch_stock not found');
        }
    } catch (e) {
        console.log('Failed to fetch RPC:', e);
    }

    console.log('\n--- Checking product_batches.status ENUM/Check ---');
    try {
        const { data } = await adminClient.rpc('execute_sql', {
            sql: `
                SELECT
                    con.conname,
                    pg_get_constraintdef(con.oid)
                FROM pg_constraint con
                INNER JOIN pg_class rel ON rel.oid = con.conrelid
                INNER JOIN pg_namespace nsp ON nsp.oid = connamespace
                WHERE rel.relname = 'product_batches' AND nsp.nspname = 'public';
            `
        });
        console.log('Constraints on product_batches:', data);
    } catch(e) {
        console.log('Failed to fetch constraints:', e);
    }
}

investigate().catch(console.error);
