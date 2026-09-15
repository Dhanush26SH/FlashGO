const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgres://postgres:flashgo-superuser-2026@aws-0-ap-south-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await client.connect();
    
    const whRes = await client.query("SELECT id, name, code FROM public.warehouses");
    const udupi = whRes.rows.find(w => w.name.includes('Udupi'));
    const manipal = whRes.rows.find(w => w.name.includes('Manipal'));
    
    console.log('Udupi:', udupi);
    console.log('Manipal:', manipal);

    const profilesRes = await client.query("SELECT id, full_name, role, employee_id, is_online, warehouse_id FROM public.profiles WHERE role IN ('picker', 'driver', 'warehouse_staff')");
    
    const countStats = (profiles, whId) => {
        const whProfiles = profiles.filter(p => p.warehouse_id === whId);
        const roles = ['picker', 'driver', 'warehouse_staff'];
        roles.forEach(r => {
            const byRole = whProfiles.filter(p => p.role === r);
            const online = byRole.filter(p => p.is_online).length;
            const offline = byRole.length - online;
            console.log(`  ${r}: ${byRole.length} total / ${online} online / ${offline} offline`);
            if (byRole.length > 0) {
                console.log(`    Names: ${byRole.map(p => p.full_name + ' (' + p.employee_id + ')').join(', ')}`);
            }
        });
    };

    console.log('\n--- Udupi Stats ---');
    if (udupi) countStats(profilesRes.rows, udupi.id);

    console.log('\n--- Manipal Stats ---');
    if (manipal) countStats(profilesRes.rows, manipal.id);

  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
