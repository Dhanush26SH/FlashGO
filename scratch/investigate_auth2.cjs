const { createClient } = require('@supabase/supabase-js');
const https = require('https');

const supabase = createClient(
  'https://szpfuommfvrfdliloxcg.supabase.co',
  'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37'
);

const inbox = 'flashgo_inv2_' + Date.now();
const email = inbox + '@mailinator.com';

function fetchMailinator() {
  return new Promise((resolve, reject) => {
    https.get(`https://mailinator.com/api/v2/domains/public/inboxes/${inbox}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

function fetchMessage(msgId) {
  return new Promise((resolve, reject) => {
    https.get(`https://mailinator.com/api/v2/domains/public/inboxes/${inbox}/messages/${msgId}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function run() {
  console.log(`[1] signInWithOtp for ${email}`);
  await supabase.auth.signInWithOtp({ email });

  let msgId = null;
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const data = await fetchMailinator();
    if (data && data.msgs && data.msgs.length > 0) {
      msgId = data.msgs[0].id;
      break;
    }
  }
  if (!msgId) return;

  const msg = await fetchMessage(msgId);
  const body = msg.parts ? msg.parts[0].body : '';
  const token = body.match(/\b\d{6}\b/)[0];
  console.log('Found OTP:', token);

  console.log(`[4] verifyOtp(type: 'signup')`);
  const { data: d2, error: e2 } = await supabase.auth.verifyOtp({ email, token, type: 'signup' });
  console.log('verifyOtp(signup) error:', e2 ? e2.message : 'null');
  
  if (e2) {
    console.log(`[5] fallback verifyOtp(type: 'email')`);
    const { data: d3, error: e3 } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    console.log('verifyOtp(email) error:', e3 ? e3.message : 'null');
  }
}

run().catch(console.error);
