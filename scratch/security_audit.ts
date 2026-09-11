import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';
const adminClient = createClient(supabaseUrl, supabaseKey);

async function runSecurityAudit() {
  const result: any = {};
  
  // 1. Audit tables and RLS status
  const { data: tables, error: err } = await adminClient.rpc('execute_sql', {
    sql: `
      SELECT 
        schemaname, 
        tablename, 
        rowsecurity as rls_enabled, 
        forcerowsecurity as rls_forced
      FROM pg_tables 
      WHERE schemaname = 'public';
    `
  });
  
  if (err) {
      // If we don't have execute_sql, try another way or we might have to use postgres direct connection or MCP.
      console.error("RPC failed", err);
  } else {
      result.tables = tables;
  }
  
  fs.writeFileSync('C:\\Users\\dhanu\\FlashGO\\scratch\\security_audit.json', JSON.stringify(result, null, 2));
}

runSecurityAudit().catch(console.error);
