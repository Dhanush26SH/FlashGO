import fs from 'fs';

let content = fs.readFileSync('supabase/migrations/20260916000141_admin_staff_work_history.sql', 'utf8');

// Picker
content = content.replace(
  /AND \(SELECT role FROM profiles WHERE id = s.staff_id\) = 'picker';/g,
  `AND (SELECT role FROM profiles WHERE id = s.staff_id) = 'picker'\n      AND s.staff_id NOT IN (SELECT id FROM profiles WHERE email IN (SELECT email FROM dev_test_accounts WHERE is_e2e_test_account = true));`
);
content = content.replace(
  /AND p.role = 'picker';/g,
  `AND p.role = 'picker'\n      AND p.email NOT IN (SELECT email FROM dev_test_accounts WHERE is_e2e_test_account = true);`
);

// Driver
content = content.replace(
  /AND \(p_worker_id IS NULL OR ds.driver_id = p_worker_id\);/g,
  `AND (p_worker_id IS NULL OR ds.driver_id = p_worker_id)\n      AND ds.driver_id NOT IN (SELECT id FROM profiles WHERE email IN (SELECT email FROM dev_test_accounts WHERE is_e2e_test_account = true));`
);
content = content.replace(
  /AND \(p_worker_id IS NULL OR ds.driver_id = p_worker_id\)\n      AND ds.driver_id NOT IN \(SELECT id FROM profiles WHERE email IN \(SELECT email FROM dev_test_accounts WHERE is_e2e_test_account = true\)\);/g, // Only replace the first one which is summary
  `AND (p_worker_id IS NULL OR ds.driver_id = p_worker_id)\n      AND ds.driver_id NOT IN (SELECT id FROM profiles WHERE email IN (SELECT email FROM dev_test_accounts WHERE is_e2e_test_account = true));`
);

// Wait, the Driver replacement above matches TWICE (line 116 and line 160). 
// On line 160, `p` is available, but `ds.driver_id` is fine to use too.
// Let's refine Driver replacement:
content = content.replace( // This resets it
  /AND \(p_worker_id IS NULL OR ds.driver_id = p_worker_id\)\n      AND ds.driver_id NOT IN \(SELECT id FROM profiles WHERE email IN \(SELECT email FROM dev_test_accounts WHERE is_e2e_test_account = true\)\);/g,
  `AND (p_worker_id IS NULL OR ds.driver_id = p_worker_id);`
);

// Do it precisely for Driver summary:
content = content.replace(
  /AND \(SELECT shift_start FROM staff_shifts WHERE id = ds.staff_shift_id\) <= p_end_date\r?\n\s+AND \(p_worker_id IS NULL OR ds.driver_id = p_worker_id\);/,
  `AND (SELECT shift_start FROM staff_shifts WHERE id = ds.staff_shift_id) <= p_end_date\n      AND (p_worker_id IS NULL OR ds.driver_id = p_worker_id)\n      AND ds.driver_id NOT IN (SELECT id FROM profiles WHERE email IN (SELECT email FROM dev_test_accounts WHERE is_e2e_test_account = true));`
);
// For Driver details:
content = content.replace(
  /AND ss.shift_start <= p_end_date\r?\n\s+AND \(p_worker_id IS NULL OR ds.driver_id = p_worker_id\);/,
  `AND ss.shift_start <= p_end_date\n      AND (p_worker_id IS NULL OR ds.driver_id = p_worker_id)\n      AND p.email NOT IN (SELECT email FROM dev_test_accounts WHERE is_e2e_test_account = true);`
);

// Warehouse Staff
content = content.replace(
  /AND \(SELECT role FROM profiles WHERE id = s.staff_id\) = 'warehouse_staff';/,
  `AND (SELECT role FROM profiles WHERE id = s.staff_id) = 'warehouse_staff'\n      AND s.staff_id NOT IN (SELECT id FROM profiles WHERE email IN (SELECT email FROM dev_test_accounts WHERE is_e2e_test_account = true));`
);
content = content.replace(
  /AND \(p_duty = 'All Duties' OR p_duty = 'Putaway'\)/,
  `AND (p_duty = 'All Duties' OR p_duty = 'Putaway')\n          AND p.email NOT IN (SELECT email FROM dev_test_accounts WHERE is_e2e_test_account = true)`
);
content = content.replace(
  /AND \(p_duty = 'All Duties' OR p_duty = 'Auditor'\)/,
  `AND (p_duty = 'All Duties' OR p_duty = 'Auditor')\n          AND p.email NOT IN (SELECT email FROM dev_test_accounts WHERE is_e2e_test_account = true)`
);
content = content.replace(
  /AND \(p_duty = 'All Duties' OR p_duty = 'Inward \+ Damage'\)/,
  `AND (p_duty = 'All Duties' OR p_duty = 'Inward + Damage')\n          AND p.email NOT IN (SELECT email FROM dev_test_accounts WHERE is_e2e_test_account = true)`
);
content = content.replace(
  /AND \(p_worker_id IS NULL OR worker_id = p_worker_id\)/,
  `AND (p_worker_id IS NULL OR worker_id = p_worker_id) AND worker_id NOT IN (SELECT id FROM profiles WHERE email IN (SELECT email FROM dev_test_accounts WHERE is_e2e_test_account = true))`
);
content = content.replace(
  /AND status = 'submitted' AND \(p_worker_id IS NULL OR counter_id = p_worker_id\)/,
  `AND status = 'submitted' AND (p_worker_id IS NULL OR counter_id = p_worker_id) AND counter_id NOT IN (SELECT id FROM profiles WHERE email IN (SELECT email FROM dev_test_accounts WHERE is_e2e_test_account = true))`
);
content = content.replace(
  /AND gr.created_at <= p_end_date AND \(p_worker_id IS NULL OR gr.received_by = p_worker_id\)/,
  `AND gr.created_at <= p_end_date AND (p_worker_id IS NULL OR gr.received_by = p_worker_id) AND gr.received_by NOT IN (SELECT id FROM profiles WHERE email IN (SELECT email FROM dev_test_accounts WHERE is_e2e_test_account = true))`
);

const newHeader = '-- Migration: 20260919133500_filter_work_history.sql\n\n';
content = content.replace(/-- Migration: 20260916000141_admin_staff_work_history.sql\r?\n/, newHeader);

fs.writeFileSync('supabase/migrations/20260919133500_filter_work_history.sql', content);
console.log('Generated new migration file successfully.');
