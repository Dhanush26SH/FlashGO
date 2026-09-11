const { execSync } = require('child_process');

function query(sql) {
    try {
        let out = execSync(`npx supabase db query "${sql}" --linked`, { encoding: 'utf8', stdio: 'pipe' });
        let jsonMatch = out.substring(out.indexOf('{'));
        return JSON.parse(jsonMatch).rows;
    } catch(e) {
        return [{ error: e.message }];
    }
}

console.log('--- Get Roles ---');
let roles = query("SELECT id, role FROM profiles WHERE role IN ('admin', 'customer', 'picker', 'driver', 'warehouse_staff')");
let adminId = roles.find(r => r.role === 'admin')?.id;
let customerId = roles.find(r => r.role === 'customer')?.id;

console.log('Admin ID:', adminId);
console.log('Customer ID:', customerId);

function runTest(name, sql) {
    console.log(`\n--- Test: ${name} ---`);
    let result = query(sql);
    console.log(JSON.stringify(result, null, 2));
}

let setAdmin = `SET LOCAL request.jwt.claims TO '{"role": "authenticated", "sub": "${adminId}"}'; SET LOCAL role TO authenticated;`;
let setCustomer = `SET LOCAL request.jwt.claims TO '{"role": "authenticated", "sub": "${customerId}"}'; SET LOCAL role TO authenticated;`;

runTest('Admin analytics access', `BEGIN; ${setAdmin} SELECT get_product_performance('2025-01-01', '2027-01-01') AS res; ROLLBACK;`);
runTest('non-Admin denial', `BEGIN; ${setCustomer} SELECT get_product_performance('2025-01-01', '2027-01-01') AS res; ROLLBACK;`);
runTest('invalid reversed date range', `BEGIN; ${setAdmin} SELECT get_product_performance('2027-01-01', '2025-01-01') AS res; ROLLBACK;`);
runTest('financial CSV/export query', `BEGIN; ${setAdmin} SELECT get_financial_ledger_export('2025-01-01', '2027-01-01') AS res; ROLLBACK;`);
