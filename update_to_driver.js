const url = 'https://szpfuommfvrfdliloxcg.supabase.co/rest/v1/profiles';
const key = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';

fetch(url, {
  method: 'PATCH',
  headers: {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  },
  body: JSON.stringify({ role: 'driver' })
})
.then(res => res.json())
.then(data => console.log('Updated users to driver:', data.length))
.catch(console.error);
