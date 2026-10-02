const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgres://postgres:flashgo-superuser-2026@db.szpfuommfvrfdliloxcg.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await client.connect();
    console.log('Connected to direct DB url!');
    const res = await client.query(`
      SELECT 
        gr.id, 
        gr.created_at
      FROM goods_receipts gr
    `);
    const grs = res.rows;
    console.log('Goods Receipts Count:', grs.length);
    
    const now = new Date();
    let todayCount = 0;
    let sevenDaysCount = 0;
    let thirtyDaysCount = 0;
    
    grs.forEach(g => {
      const d = new Date(g.created_at);
      const diff = (now - d) / (1000 * 60 * 60 * 24);
      if (diff <= 1) todayCount++;
      if (diff <= 7) sevenDaysCount++;
      if (diff <= 30) thirtyDaysCount++;
    });
    console.log(`Today: ${todayCount}, 7 Days: ${sevenDaysCount}, 30 Days: ${thirtyDaysCount}`);

  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
