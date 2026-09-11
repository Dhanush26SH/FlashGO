const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseAnonKey = 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function recover() {
  const { data: authData } = await supabase.auth.signInWithPassword({
    email: 'drivarrr1@gmail.com',
    password: 'password123'
  });

  const selfiePath = 'c886c5b1-8d41-4b71-8ab9-095d4a24fbad/selfie_1789045745319.jpg';
  const { data } = await supabase.storage.from('driver_documents').createSignedUrl(selfiePath, 3600);
  
  const resp = await fetch(data.signedUrl);
  const buffer = await resp.arrayBuffer();
  
  const b64 = Buffer.from(buffer).toString('base64');
  const startIndex = b64.indexOf('iVBORw0K');
  if (startIndex === -1) {
    console.error("Could not find PNG start!");
    return;
  }
  
  const cleanB64 = b64.substring(startIndex);
  const cleanBuffer = Buffer.from(cleanB64, 'base64');
  
  fs.writeFileSync('C:\\Users\\dhanu\\FlashGO\\recovered_selfie.png', cleanBuffer);
  console.log("Recovered size:", cleanBuffer.length);
  
  const newSelfiePath = selfiePath.replace('.jpg', '_fixed.png');
  const { data: uploadData, error } = await supabase.storage.from('driver_documents').upload(newSelfiePath, cleanBuffer, {
    contentType: 'image/png',
    upsert: false
  });
  
  if (error) {
    console.error("Upload error:", error);
  } else {
    console.log("Successfully recovered and updated the file!");
    console.log("New Path:", newSelfiePath);
  }
}

recover();
