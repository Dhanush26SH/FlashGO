const url = 'https://szpfuommfvrfdliloxcg.supabase.co/rest/v1/slot_bookings?select=picker_id&limit=1';
const key = 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';

fetch(url, {
  headers: {
    'apikey': key,
    'Authorization': `Bearer ${key}`
  }
})
.then(res => res.json())
.then(data => console.log(JSON.stringify(data, null, 2)))
.catch(err => console.error(err));
