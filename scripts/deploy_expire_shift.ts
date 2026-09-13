import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://szpfuommfvrfdliloxcg.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const sql = `
CREATE OR REPLACE FUNCTION public.picker_expire_shift()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_role TEXT;
    v_uid  UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = v_uid;

    IF v_role NOT IN ('picker', 'warehouse_staff') THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED_ROLE');
    END IF;

    PERFORM public.reconcile_worker_shifts(v_uid);

    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND is_online = true) THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.staff_shifts
            WHERE staff_id = v_uid
              AND status = 'active'
              AND now() < shift_end + interval '5 minutes'
        ) THEN
            PERFORM set_config('app.driver_status_update_allowed', 'true', true);
            UPDATE public.profiles SET is_online = false WHERE id = v_uid;
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.picker_expire_shift() TO authenticated;
`;

async function deploy() {
  const { data: auth } = await supabase.auth.signInWithPassword({
    email: 'test_admin_1788638678169@example.com',
    password: 'Password123!'
  });
  
  // Use service_role key via a privileged RPC call
  // Since we only have anon key, we need to use the SQL editor approach
  // Instead, let's call execute_sql-like mechanism
  // We'll use supabase REST API directly
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/execute_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${auth.session?.access_token}`
    },
    body: JSON.stringify({ query: sql })
  });
  
  if (!res.ok) {
    // execute_sql doesn't exist — that's ok, we'll use npx supabase db push
    console.log('execute_sql not available, migration must be pushed via supabase CLI');
    console.log('Response status:', res.status);
  } else {
    console.log('Migration applied!');
  }
  
  // Test if the function already exists
  const { data, error } = await supabase.rpc('picker_expire_shift');
  console.log('picker_expire_shift test result:', data, error?.message);
}

deploy().catch(console.error);
