async function runSql() {
  const fetch = globalThis.fetch; // Use built-in node fetch
  const res = await fetch('https://api.supabase.com/v1/projects/szpfuommfvrfdliloxcg/database/query', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer sbp_ed0e10a1277a53248797e06d3a6f894a67b48254',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: "SELECT id, email, confirmed_at, email_confirmed_at, created_at, role, raw_user_meta_data FROM auth.users WHERE email = 'new_random_test_1234@gmail.com';" })
  });
  console.log('Status:', res.status);
  const text = await res.text();
  console.log('Auth Users Result:', text);
  
  if (res.status === 200) {
    const data = JSON.parse(text);
    if (data.length > 0) {
      const id = data[0].id;
      const res2 = await fetch('https://api.supabase.com/v1/projects/szpfuommfvrfdliloxcg/database/query', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer sbp_ed0e10a1277a53248797e06d3a6f894a67b48254',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: "SELECT * FROM public.profiles WHERE id = '" + id + "';" })
      });
      console.log('Profiles Result:', await res2.text());
    }
  }
}
runSql();
