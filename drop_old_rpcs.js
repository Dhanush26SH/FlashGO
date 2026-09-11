// migration_script.js
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const supabaseUrl = (env.match(/VITE_SUPABASE_URL=(.*)/)||[])[1]?.trim();
const supabaseKey = (env.match(/VITE_SUPABASE_SERVICE_ROLE_KEY=(.*)/)||[])[1]?.trim();

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data, error } = await supabase.rpc('execute_sql', {
        query: `
            DO $$ 
            DECLARE 
                rec record; 
            BEGIN 
                FOR rec IN 
                    SELECT oid::regprocedure AS proc_name 
                    FROM pg_proc 
                    WHERE proname = 'process_checkout' 
                LOOP 
                    EXECUTE 'DROP FUNCTION ' || rec.proc_name || ' CASCADE'; 
                END LOOP; 
            END $$;
        `
    });
    console.log(error ? error : "Dropped old RPCs successfully");
}
run();
