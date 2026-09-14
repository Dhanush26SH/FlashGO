const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'mobile-staff/.env' });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Remote Project URL:", supabaseUrl);
  
  // 1. Get a picker
  const { data: profileData } = await supabase.from('profiles').select('*').eq('role', 'picker').limit(1).single();
  console.log("\n--- PICKER ---");
  console.log("ID:", profileData?.id);
  console.log("Role:", profileData?.role);
  
  if (!profileData) {
      console.log("No picker found.");
      return;
  }
  
  // 2. Current/most recent staff_shift
  const { data: shift } = await supabase.from('staff_shifts').select('*').eq('staff_id', profileData.id).order('shift_start', { ascending: false }).limit(1).single();
  console.log("\n--- MOST RECENT SHIFT ---");
  console.log(shift);
  
  // 3. Current-week SUM(items_picked)
  // We'll use approx dates for current week or just sum everything
  const today = new Date();
  const currentDay = today.getDay();
  const daysToMonday = currentDay === 0 ? 6 : currentDay - 1;
  const currentMonday = new Date(today);
  currentMonday.setDate(today.getDate() - daysToMonday);
  currentMonday.setHours(0, 0, 0, 0);
  const currentSunday = new Date(currentMonday);
  currentSunday.setDate(currentMonday.getDate() + 6);
  currentSunday.setHours(23, 59, 59, 999);
  
  const { data: shifts } = await supabase.from('staff_shifts').select('items_picked').eq('staff_id', profileData.id).gte('started_at', currentMonday.toISOString()).lte('started_at', currentSunday.toISOString());
  const items = shifts ? shifts.reduce((acc, curr) => acc + (curr.items_picked || 0), 0) : 0;
  console.log("\n--- CURRENT-WEEK ITEMS PICKED ---");
  console.log(items);
  
  // 4. Current-week staff_shift_payouts
  const { data: payouts } = await supabase.from('staff_shift_payouts').select('total_amount').eq('staff_id', profileData.id).gte('earning_date', currentMonday.toISOString().split('T')[0]).lte('earning_date', currentSunday.toISOString().split('T')[0]);
  const totalPayout = payouts ? payouts.reduce((acc, curr) => acc + Number(curr.total_amount || 0), 0) : 0;
  console.log("\n--- CURRENT-WEEK SHIFT PAYOUTS ---");
  console.log(totalPayout);
  
  // 5. Applicable picker_weekly_targets
  const { data: targets } = await supabase.from('picker_weekly_targets').select('*').lte('effective_from', currentSunday.toISOString()).order('effective_from', { ascending: false }).limit(1);
  console.log("\n--- APPLICABLE WEEKLY TARGETS ---");
  console.log(targets);
  
  // 6. Applicable picker_bonus_offers
  const { data: offers } = await supabase.from('picker_bonus_offers').select('*').eq('is_active', true).lte('start_date', today.toISOString().split('T')[0]).gte('end_date', today.toISOString().split('T')[0]);
  console.log("\n--- APPLICABLE BONUS OFFERS ---");
  console.log(offers);
  
  // 7. picker_bonus_awards
  const { data: awards } = await supabase.from('picker_bonus_awards').select('*').eq('staff_id', profileData.id);
  console.log("\n--- BONUS AWARDS ---");
  console.log(awards);
}

run();
