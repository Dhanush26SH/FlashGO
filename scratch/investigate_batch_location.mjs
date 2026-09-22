import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';
const adminClient = createClient(supabaseUrl, supabaseServiceKey);

async function investigate() {
    console.log('--- Checking tables with batch_id ---');
    try {
        const { data } = await adminClient.rpc('execute_sql', {
            sql: `
                SELECT table_name, column_name 
                FROM information_schema.columns 
                WHERE column_name LIKE '%batch%' 
                AND table_schema = 'public';
            `
        });
        console.log('Tables with batch columns:', data);
    } catch(e) {}

    console.log('\n--- Checking Auditor tables ---');
    try {
        const { data } = await adminClient.rpc('execute_sql', {
            sql: `
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND (table_name LIKE '%audit%' OR table_name LIKE '%cycle%');
            `
        });
        console.log('Auditor tables:', data);
    } catch(e) {}

    console.log('\n--- Checking product_batches statuses ---');
    try {
        const { data } = await adminClient.rpc('execute_sql', {
            sql: `
                SELECT pg_get_constraintdef(c.oid) as def
                FROM pg_constraint c
                JOIN pg_class t ON c.conrelid = t.oid
                WHERE t.relname = 'product_batches' AND c.contype = 'c';
            `
        });
        console.log('product_batches check constraints:', data);
    } catch(e) {}
}

investigate().catch(console.error);
