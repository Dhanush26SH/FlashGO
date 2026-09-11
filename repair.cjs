const fs = require('fs');
const files = [
  'supabase/migrations/20260902000001_phase21_closure.sql',
  'supabase/migrations/20260902000002_admin_audit_logs.sql',
  'supabase/migrations/20260902000003_audit_closure.sql',
  'supabase/migrations/20260902000004_notifications_schema.sql',
  'supabase/migrations/20260902000005_notification_hooks.sql',
  'supabase/migrations/20260902000006_final_notification_hooks.sql',
  'supabase/migrations/20260902000007_phase23_promotions.sql'
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/AS \$BODY\r?\n/g, 'AS $$\n');
  content = content.replace(/\$BODY;/g, '$$;');
  content = content.replace(/CHAR\(10\)/g, 'CHR(10)');
  fs.writeFileSync(file, content);
  console.log('Fixed:', file);
});
