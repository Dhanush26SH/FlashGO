const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseAnonKey = 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'admin123@flashgo.com',
    password: 'password123'
  });

  if (authError) {
    console.error("Auth Error:", authError);
    return;
  }
  
  console.log("Logged in as Admin:", authData.user.id);
  
  const selfiePath = 'c886c5b1-8d41-4b71-8ab9-095d4a24fbad/selfie_1789045745319.jpg';
  const { data, error } = await supabase.storage.from('driver_documents').createSignedUrl(selfiePath, 3600);
  
  if (error) {
    console.error("Signed URL Error:", error);
  } else {
    console.log("Signed URL generated successfully:");
    console.log(data.signedUrl);
    
    // Now try fetching it
    try {
      const resp = await fetch(data.signedUrl);
      console.log("Fetch Status:", resp.status);
      console.log("Fetch Content-Type:", resp.headers.get('content-type'));
      const buffer = await resp.arrayBuffer();
      console.log("Fetch Size:", buffer.byteLength);
    } catch (err) {
      console.error("Fetch Error:", err);
    }
  }
}

test();
