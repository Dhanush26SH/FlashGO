import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://szpfuommfvrfdliloxcg.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.from('products').select('id, name, category_id').limit(10);
  console.log('Test query result:', data ? data.length : error);
  
  // Test upload
  const testFileName = 'test_upload.txt';
  const testFileContent = 'Hello World';
  const { data: uploadData, error: uploadError } = await supabase.storage.from('product-images').upload(testFileName, testFileContent, { upsert: true });
  console.log('Test upload result:', uploadData || uploadError);
}

run();
