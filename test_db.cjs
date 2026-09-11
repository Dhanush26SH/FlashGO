const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const SUPABASE_URL = (env.match(/VITE_SUPABASE_URL=(.*)/) || [])[1]?.trim();
const SUPABASE_ANON_KEY = (env.match(/VITE_SUPABASE_ANON_KEY=(.*)/) || [])[1]?.trim();

const s = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
s.from('support_tickets').select('*').limit(1).then(x => console.log(x.data ? Object.keys(x.data[0] || {}) : x.error));
