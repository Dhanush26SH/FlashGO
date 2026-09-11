const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseAnonKey = 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  const { data: authData } = await supabase.auth.signInWithPassword({
    email: 'admin123@flashgo.com',
    password: 'password123'
  });

  const selfiePath = 'c886c5b1-8d41-4b71-8ab9-095d4a24fbad/selfie_1789045745319.jpg';
  const { data } = await supabase.storage.from('driver_documents').createSignedUrl(selfiePath, 3600);
  
  const resp = await fetch(data.signedUrl);
  const buffer = await resp.arrayBuffer();
  fs.writeFileSync('C:\\Users\\dhanu\\FlashGO\\test_selfie.jpg', Buffer.from(buffer));
  console.log("Saved test_selfie.jpg");
}

test();
