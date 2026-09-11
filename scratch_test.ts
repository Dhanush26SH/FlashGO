import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
// WARNING: Service role key used ONLY LOCALLY for DIAGNOSIS, NOT in the browser!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || import.meta.env?.VITE_SUPABASE_ANON_KEY || ''; // wait, anon key doesn't work for download without RLS
