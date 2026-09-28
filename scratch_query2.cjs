require('dotenv').config({ path: './mobile-staff/.env' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''; // this won't work for admin unless we have service key

// Wait, the anon key won't let us act as the driver unless we login.
// We can use the service role key if we can find it.
console.log(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
