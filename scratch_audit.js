const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim();

const sb = createClient(url, key);

async function run() {
  const { data: authData, error: authErr } = await sb.auth.signInWithPassword({
    email: 'admin@flashgo.com',
    password: 'password123'
  });
  
  const {data: allTasks} = await sb.from('putaway_tasks').select('*');
  const counts = { 
    total: allTasks ? allTasks.length : 0, 
    pending: allTasks ? allTasks.filter(t=>t.status==='pending').length : 0, 
    in_progress: allTasks ? allTasks.filter(t=>t.status==='in_progress').length : 0, 
    completed: allTasks ? allTasks.filter(t=>t.status==='completed').length : 0 
  };
  console.log('1. LIVE DATA COUNTS:', counts);
  
  if (allTasks && allTasks.length > 0) {
    const candleTask = allTasks.find(t => t.id === 'd9de6374-5cb9-4eb0-941e-c0d80e47159b');
    console.log('Candle task:', candleTask);
    
    if (candleTask) {
        const udupiWid = candleTask.warehouse_id;
        console.log('Udupi WID:', udupiWid);
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const startOfToday = today.toISOString();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const endOfToday = tomorrow.toISOString();
        
        console.log('5. EXACT DATES:', startOfToday, endOfToday, candleTask.completed_at);
        
        const pCompletedToday = await sb.from('putaway_tasks').select('*', { count: 'exact', head: true })
            .eq('warehouse_id', udupiWid).eq('status', 'completed')
            .gte('completed_at', startOfToday).lt('completed_at', endOfToday);
        console.log('3. KPI Completed Today:', pCompletedToday.count);
        
        const start7 = new Date();
        start7.setDate(new Date().getDate() - 7);
        start7.setHours(0,0,0,0);
        const startDate = start7.toISOString();
        const endDate = (new Date()).toISOString();
        
        let query = sb
            .from('putaway_tasks')
            .select('*, product:products(name, sku, internal_barcode), batch:product_batches(batch_number), worker:profiles!worker_id(full_name, employee_id)', { count: 'exact' })
            .eq('warehouse_id', udupiWid)
            .or(status.in.(pending,in_progress),and(status.eq.completed,completed_at.gte.,completed_at.lte.))
            .order('created_at', { ascending: false })
            .range(0, 24);
        
        const { data: histData, count: histCount, error: histErr } = await query;
        console.log('4 & 6 & 7. HISTORY QUERY result:', histData ? histData.length : 0, 'Count:', histCount, 'Error:', histErr);
    }
  }
}
run();
