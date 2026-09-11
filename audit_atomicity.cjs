const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://szpfuommfvrfdliloxcg.supabase.co';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';

const supabase = createClient(SUPABASE_URL, ANON_KEY);

async function diagnose() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'drivarrr1@gmail.com',
    password: 'password123'
  });
  if (!data?.user) return console.log('Auth failed');

  const userId = data.user.id;
  const shiftId = 'c86eb1f2-64b8-41f8-ac5f-591239b1dec8';

  const { data: shift } = await supabase.from('staff_shifts').select('*').eq('id', shiftId).single();
  console.log('Shift:', shift);

  const { data: sessions } = await supabase.from('driver_sessions').select('*').eq('driver_id', userId).order('created_at', { ascending: false }).limit(1);
  console.log('Latest Session:', sessions);

  const { data: checkins } = await supabase.from('driver_check_ins').select('*').eq('shift_id', shiftId);
  console.log('Check-ins:', checkins);

  const { data: prof } = await supabase.from('profiles').select('is_online').eq('id', userId).single();
  console.log('Profile is_online:', prof);

  // Check storage bucket
  const { data: files } = await supabase.storage.from('driver_check_ins').list(`${userId}/${shiftId}`);
  console.log('Storage Files:', files);

  await supabase.auth.signOut();
}

diagnose().catch(console.error);
