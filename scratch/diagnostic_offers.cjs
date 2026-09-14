const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'mobile-staff/.env' });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: profileData } = await supabase.from('profiles').select('*').eq('role', 'picker').limit(1).single();
  console.log("Picker profile ID:", profileData?.id);
  
  if (!profileData) {
      console.log("No picker found.");
      return;
  }
  
  const { data: targets } = await supabase.from('picker_weekly_targets').select('*');
  console.log("applicable picker_weekly_targets row:", targets);
  
  const { data: shifts } = await supabase.from('staff_shifts').select('items_picked').eq('staff_id', profileData.id);
  const items = shifts ? shifts.reduce((acc, curr) => acc + (curr.items_picked || 0), 0) : 0;
  console.log("actual SUM(staff_shifts.items_picked) for current Monday-Sunday week:", items);
  
  const { data: payouts } = await supabase.from('staff_shift_payouts').select('total_amount').eq('staff_id', profileData.id);
  const totalPayout = payouts ? payouts.reduce((acc, curr) => acc + Number(curr.total_amount || 0), 0) : 0;
  console.log("actual finalized staff_shift_payouts total for this week:", totalPayout);
  
  const { data: activeShifts } = await supabase.from('staff_shifts').select('*').eq('staff_id', profileData.id).eq('status', 'active');
  console.log("active shift calculated earnings if applicable:", activeShifts);
  
  const { data: offers } = await supabase.from('picker_bonus_offers').select('*');
  console.log("actual picker_bonus_offers applicable now:", offers);
  
  const { data: completedShifts } = await supabase.from('staff_shifts').select('*').eq('staff_id', profileData.id).eq('status', 'completed').not('work_slot_id', 'is', null);
  console.log("actual completed-slot count:", completedShifts ? completedShifts.length : 0);
  
  const { data: awards } = await supabase.from('picker_bonus_awards').select('*').eq('staff_id', profileData.id);
  console.log("actual picker_bonus_awards:", awards);
}

run();
