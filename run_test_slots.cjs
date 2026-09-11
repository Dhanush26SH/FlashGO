const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8');
const matchUrl = env.match(/VITE_SUPABASE_URL=(.*)/);
const matchKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/) || env.match(/VITE_SUPABASE_ANON_KEY=(.*)/);

const url = matchUrl[1];
const key = matchKey[1];

async function run() {
  const res = await fetch(`${url}/rest/v1/rpc/run_test_slots`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`
    }
  });
  const text = await res.text();
  console.log('Result:', text);
}
run();
