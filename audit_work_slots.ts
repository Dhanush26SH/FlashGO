import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  await supabase.auth.signInWithPassword({
    email: 'test_admin_1788638678169@example.com',
    password: 'Password123!'
  });

  // Fetch recently created slots
  const { data: slots, error } = await supabase
    .from('work_slots')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);
    
  if (error) {
    console.error('Error fetching slots:', error);
    return;
  }

  console.log('Recent Work Slots:');
  for (const slot of slots) {
      console.log(`- ID: ${slot.id}`);
      console.log(`  Role: ${slot.target_role}`);
      console.log(`  Warehouse ID: ${slot.warehouse_id}`);
      console.log(`  Start Time: ${slot.start_time}`);
      console.log(`  End Time: ${slot.end_time}`);
      console.log(`  Capacity: ${slot.capacity}`);
      console.log(`  Status: ${slot.status}`);
      console.log(`  Created At: ${slot.created_at}`);
  }
}

run();
