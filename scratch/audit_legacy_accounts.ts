import { execSync } from 'child_process';
import * as fs from 'fs';

const emails = [
  'newadmin_xyz_987@flashgo.com',
  'dhanushshriyan0491@gmail.com',
  'admin999@flashgo.com',
  'admin_test@flashgo.com',
  'dhanushpshriyan@gmail.com',
  'dhanushshriyan91+admin@gmail.com',
  'dnu840953@gmail.com',
  'admin-test-v2@flashgo.com',
  'admin123@flashgo.com'
];

async function run() {
  console.log("Generating SQL to audit dependencies for legacy accounts...");
  
  // Get all FKs to auth.users(id) or public.profiles(id)
  const queryFKs = `
    SELECT 
        tc.table_schema, 
        tc.table_name, 
        kcu.column_name
    FROM 
        information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' 
      AND ((ccu.table_schema = 'public' AND ccu.table_name = 'profiles' AND ccu.column_name = 'id')
       OR (ccu.table_schema = 'auth' AND ccu.table_name = 'users' AND ccu.column_name = 'id'));
  `;

  fs.writeFileSync('scratch/query_fks.sql', queryFKs);
  
  let fkOutput;
  try {
    fkOutput = execSync('npx supabase db query -f scratch/query_fks.sql --linked', { encoding: 'utf8' });
  } catch(e) {
    console.error(e.stdout);
    return;
  }
  
  // Extract rows
  const fkMatch = fkOutput.match(/"rows": \[\s*([\s\S]*?)\s*\],\s*"warning"/);
  if (!fkMatch) {
    console.log("Failed to parse FKs", fkOutput);
    return;
  }
  
  const fks = JSON.parse(`[${fkMatch[1]}]`);
  
  let auditSql = `
    WITH accounts AS (
      SELECT id, email, full_name, employee_id, role, is_suspended, is_pending_staff, created_at
      FROM public.profiles
      WHERE email IN (${emails.map(e => `'${e}'`).join(', ')})
    )
    SELECT json_agg(
      json_build_object(
        'profile', row_to_json(a),
        'auth_created_at', (SELECT created_at FROM auth.users u WHERE u.id = a.id),
        'last_sign_in_at', (SELECT last_sign_in_at FROM auth.users u WHERE u.id = a.id),
        'dev_test_accounts', (SELECT row_to_json(d) FROM public.dev_test_accounts d WHERE d.email = a.email),
        'dependencies', (
          SELECT jsonb_object_agg(t.tbl, t.cnt)
          FROM (
  `;
  
  // Add subqueries for every FK table
  const subqueries = fks.map(fk => {
    return `SELECT '${fk.table_name}.${fk.column_name}' AS tbl, (SELECT count(*) FROM ${fk.table_schema}.${fk.table_name} WHERE ${fk.column_name} = a.id) AS cnt`;
  });
  
  auditSql += subqueries.join(' UNION ALL ') + `
          ) t
          WHERE t.cnt > 0
        )
      )
    ) as results
    FROM accounts a;
  `;
  
  fs.writeFileSync('scratch/audit_dependencies.sql', auditSql);
  
  let auditOutput;
  try {
    console.log("Running audit query...");
    auditOutput = execSync('npx supabase db query -f scratch/audit_dependencies.sql --linked', { encoding: 'utf8' });
    fs.writeFileSync('scratch/audit_dependencies_raw.json', auditOutput);
  } catch(e) {
    console.error(e.stdout);
    return;
  }
  
  // Extract results
  const resMatch = auditOutput.match(/"rows": \[\s*\{\s*"results": (\[[\s\S]*?\])\s*\}\s*\],\s*"warning"/);
  if (!resMatch) {
    console.log("Failed to parse audit results", auditOutput);
    return;
  }
  
  const results = JSON.parse(resMatch[1]);
  fs.writeFileSync('scratch/audit_report.json', JSON.stringify(results, null, 2));
  console.log("Done! Results written to scratch/audit_report.json");
}

run();
