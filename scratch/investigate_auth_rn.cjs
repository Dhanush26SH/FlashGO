const { createClient } = require('@supabase/supabase-js');
const https = require('https');

const supabase = createClient(
  'https://szpfuommfvrfdliloxcg.supabase.co',
  'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37'
);

const inbox = 'flashgo_rn_' + Date.now();
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
  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log('[AUTH_EVENT]', event, session ? session.user.id : 'no-session');
    if (session) {
      console.log('Running verifyAndLoadProfile simulation...');
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      console.log('Profile Load Result:', error ? error.message : data.role);
    }
  });

  console.log(`[1] signInWithOtp`);
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

  console.log(`[4] verifyOtp(type: 'email')`);
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  console.log('verifyOtp error:', error ? error.message : 'none');
}

run().catch(console.error);
