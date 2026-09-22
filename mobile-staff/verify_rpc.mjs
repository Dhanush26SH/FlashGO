import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read .env from FlashGO
const envPath = path.resolve(__dirname, '..', '.env');
const envFile = fs.readFileSync(envPath, 'utf8');

let supabaseUrl = '';
let supabaseKey = '';

for (const line of envFile.split('\n')) {
  if (line.startsWith('VITE_SUPABASE_URL=')) supabaseUrl = line.split('=')[1].trim();
  if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) supabaseKey = line.split('=')[1].trim();
}

async function testDuty(dutyName) {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/admin_change_active_shift_duty`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    },
    body: JSON.stringify({
      p_shift_id: '00000000-0000-0000-0000-000000000000',
      p_new_duty: dutyName
    })
  });
  
  const text = await res.text();
  console.log(`Result for ${dutyName}:`, text);
}

async function run() {
  console.log('Testing valid duty: damage_expiry');
  await testDuty('damage_expiry');

  console.log('Testing valid duty: fnv');
  await testDuty('fnv');

  console.log('Testing invalid duty: random_duty_123');
  await testDuty('random_duty_123');
}

run();
