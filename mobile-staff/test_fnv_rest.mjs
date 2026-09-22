import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.resolve(__dirname, '..', '.env');
const envFile = fs.readFileSync(envPath, 'utf8');

let supabaseUrl = '';
let supabaseKey = '';

for (const line of envFile.split('\n')) {
  if (line.startsWith('VITE_SUPABASE_URL=')) supabaseUrl = line.split('=')[1].trim();
  if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) supabaseKey = line.split('=')[1].trim();
}

async function testRpc() {
  const dummyUUID = '00000000-0000-0000-0000-000000000000';
  
  // 1. Invalid reason
  let res = await fetch(`${supabaseUrl}/rest/v1/rpc/remove_fnv_batch_inventory`, {
    method: 'POST',
    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_location_id: dummyUUID, p_batch_id: dummyUUID, p_removed_qty: 1, p_scanned_barcode: '123', p_reason: 'invalid_reason', p_user_id: dummyUUID })
  });
  let data = await res.json();
  if (data.message && data.message.includes('Invalid reason')) {
    console.log("PASS: Rejected invalid reason");
  } else {
    console.error("FAIL: Did not reject invalid reason properly", data);
  }

  // 2. Negative quantity
  res = await fetch(`${supabaseUrl}/rest/v1/rpc/remove_fnv_batch_inventory`, {
    method: 'POST',
    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_location_id: dummyUUID, p_batch_id: dummyUUID, p_removed_qty: -1, p_scanned_barcode: '123', p_reason: 'spoiled', p_user_id: dummyUUID })
  });
  data = await res.json();
  if (data.message && data.message.includes('greater than zero')) {
    console.log("PASS: Rejected negative quantity");
  } else {
    console.error("FAIL: Did not reject negative quantity properly", data);
  }

  // 3. Unauthorized user
  res = await fetch(`${supabaseUrl}/rest/v1/rpc/remove_fnv_batch_inventory`, {
    method: 'POST',
    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_location_id: dummyUUID, p_batch_id: dummyUUID, p_removed_qty: 1, p_scanned_barcode: '123', p_reason: 'spoiled', p_user_id: dummyUUID })
  });
  data = await res.json();
  if (data.message && data.message.includes('User not found')) {
    console.log("PASS: Rejected invalid user");
  } else {
    console.error("FAIL: Did not reject invalid user properly", data);
  }
}

testRpc();
