import * as fs from 'fs';

let content = fs.readFileSync('scratch/audit_results.json', 'utf16le');
if (content.charCodeAt(0) === 0xFEFF) {
  content = content.slice(1);
}
const data = JSON.parse(content);

const relevantNames = [
  'Test Admin', 'DHAA', 'Admin User', 'Admin Test', 'Rahul', 'New Staff', 'Hacked Name', 'Admin', 'Pratham',
  'Driver1', 'Warehousestaff1', 'Vaibhav', 'Bob', 'Rahul Patkar'
];

console.log("Name | Employee ID | Email | Role | Is Pending | Is Suspended | Shifts | Ledger | E2E | Bypass | auth_created_at");
console.log("---|---|---|---|---|---|---|---|---|---|---");

for (const row of data.rows) {
  if (
    relevantNames.some(name => row.full_name && row.full_name.includes(name)) ||
    (row.email && row.email.includes('admin')) ||
    (row.email && row.email.includes('test')) ||
    (row.employee_id && ['DRV-9374', 'EMP-10000', 'EMP-10001', 'EMP-10002', 'ADM-3570', 'DRV-3547'].includes(row.employee_id))
  ) {
    console.log(`${row.full_name} | ${row.employee_id} | ${row.email} | ${row.role} | ${row.is_pending_staff} | ${row.is_suspended} | ${row.shifts_count} | ${row.ledger_count} | ${row.is_e2e_test_account} | ${row.bypass_geofence} | ${row.auth_created_at}`);
  }
}
