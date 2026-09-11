-- Migration: 20260822000003_auth_user_trigger.sql
-- Description: Automatically provisions a public.profiles row when a new user registers via Supabase Auth.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  IF NEW.email IS NULL OR btrim(NEW.email) = '' THEN
    RAISE EXCEPTION 'Email is required to provision a FlashGO customer profile';
  END IF;

  -- Insert a new profile for the registering user.
  -- The ON CONFLICT DO NOTHING ensures idempotency if a staff profile was manually seeded.
  INSERT INTO public.profiles (
    id, 
    email, 
    full_name,
    role, 
    wallet_balance, 
    loyalty_points, 
    is_suspended,
    is_online
  )
  VALUES (
    NEW.id,
    NEW.email,
    -- Extract name from raw_user_meta_data if present, else null
    NEW.raw_user_meta_data->>'full_name',
    
    -- FORCE SECURITY DEFAULTS (Ignoring any client metadata attempts to elevate privileges)
    'customer'::public.user_role,
    0.00,
    0,
    false,
    false
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create the trigger on the hidden auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
