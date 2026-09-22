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

// We will use anon key for REST requests but since the RPC is security definer, we need a valid user auth.
// Alternatively, we can use the service role key to sign a JWT, or we can just test the RPC directly in sql via psql?
// But we want to verify backend authorization which uses auth.uid().
// Since we don't have user passwords here easily, we can run a SQL test block directly using postgres service_role.

const sqlTestBlock = `
DO $$ 
DECLARE
  v_user_id UUID;
  v_batch_id UUID;
  v_loc_id UUID;
  v_barcode TEXT;
BEGIN
  -- We don't have valid context inside an anonymous block unless we mock it, 
  -- but we can test if the RPC fails appropriately by passing dummy data.
  
  BEGIN
    PERFORM public.remove_fnv_batch_inventory(gen_random_uuid(), gen_random_uuid(), -1, 'barcode', 'spoiled', gen_random_uuid());
    RAISE EXCEPTION 'Failed to reject negative quantity';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Removed quantity must be greater than zero.%' THEN
      RAISE EXCEPTION 'Wrong error for negative qty: %', SQLERRM;
    END IF;
  END;

  BEGIN
    PERFORM public.remove_fnv_batch_inventory(gen_random_uuid(), gen_random_uuid(), 1, 'barcode', 'invalid_reason', gen_random_uuid());
    RAISE EXCEPTION 'Failed to reject invalid reason';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Invalid reason%' THEN
      RAISE EXCEPTION 'Wrong error for invalid reason: %', SQLERRM;
    END IF;
  END;

  BEGIN
    PERFORM public.remove_fnv_batch_inventory(gen_random_uuid(), gen_random_uuid(), 1, 'barcode', 'spoiled', gen_random_uuid());
    RAISE EXCEPTION 'Failed to reject non-existent user';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%User not found or suspended.%' THEN
      RAISE EXCEPTION 'Wrong error for invalid user: %', SQLERRM;
    END IF;
  END;

  RAISE NOTICE 'All failure path validations passed!';
END $$;
`;

fs.writeFileSync('test_fnv_failures.sql', sqlTestBlock);
console.log("SQL test script created.");
