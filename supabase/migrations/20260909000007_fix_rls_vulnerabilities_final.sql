-- 1. Enable RLS on vulnerable tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

-- 2. Revoke dangerous blanket privileges from anon and authenticated
REVOKE ALL ON public.profiles FROM anon, authenticated;
REVOKE ALL ON public.categories FROM anon, authenticated;
REVOKE ALL ON public.products FROM anon, authenticated;
REVOKE ALL ON public.wallet_transactions FROM anon, authenticated;

-- 3. Restore necessary read grants
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT SELECT ON public.products TO anon, authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.wallet_transactions TO authenticated;

-- 4. Provide exact column-level UPDATE grant for profiles to authenticated users
GRANT UPDATE (full_name, phone) ON public.profiles TO authenticated;

-- 5. Drop old insecure policies on profiles, categories, products, wallet_transactions
DROP POLICY IF EXISTS "Public profiles reading" ON public.profiles;
DROP POLICY IF EXISTS "User update self profile" ON public.profiles;
DROP POLICY IF EXISTS "Anyone read active categories" ON public.categories;
DROP POLICY IF EXISTS "Anyone read products" ON public.products;
DROP POLICY IF EXISTS "Users read self wallet" ON public.wallet_transactions;

-- 6. Create precise RBAC policies

-- Create helper function to avoid infinite recursion
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.user_role
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- Categories: Anyone can read (no is_active filtering as it doesn't exist)
DROP POLICY IF EXISTS "Public catalog categories read" ON public.categories;
CREATE POLICY "Public catalog categories read" 
ON public.categories FOR SELECT 
USING (true);

-- Products: Anyone can read active products. 
DROP POLICY IF EXISTS "Public active products read" ON public.products;
CREATE POLICY "Public active products read" 
ON public.products FOR SELECT 
USING (is_active = true);

-- Products: Admin can read all products (active and inactive)
DROP POLICY IF EXISTS "Admin read all products" ON public.products;
CREATE POLICY "Admin read all products" 
ON public.products FOR SELECT 
TO authenticated 
USING (
  public.get_my_role() = 'admin'::public.user_role
);

-- Profiles: Customer read own
DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
CREATE POLICY "Users read own profile" 
ON public.profiles FOR SELECT 
TO authenticated 
USING (auth.uid() = id);

-- Profiles: Admin read all
DROP POLICY IF EXISTS "Admin read all profiles" ON public.profiles;
CREATE POLICY "Admin read all profiles" 
ON public.profiles FOR SELECT 
TO authenticated 
USING (
  public.get_my_role() = 'admin'::public.user_role
);

-- Profiles: Customer update safe columns with RLS
DROP POLICY IF EXISTS "Users update own safe profile fields" ON public.profiles;
CREATE POLICY "Users update own safe profile fields" 
ON public.profiles FOR UPDATE 
TO authenticated 
USING (auth.uid() = id) 
WITH CHECK (auth.uid() = id);

-- Wallet Transactions: Customer read own
DROP POLICY IF EXISTS "Users read own wallet transactions" ON public.wallet_transactions;
CREATE POLICY "Users read own wallet transactions" 
ON public.wallet_transactions FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

-- Wallet Transactions: Admin read all
DROP POLICY IF EXISTS "Admin read all wallet transactions" ON public.wallet_transactions;
CREATE POLICY "Admin read all wallet transactions" 
ON public.wallet_transactions FOR SELECT 
TO authenticated 
USING (
  public.get_my_role() = 'admin'::public.user_role
);


-- 7. Fix order_items dangerous policies
DROP POLICY IF EXISTS "View order items" ON public.order_items;
DROP POLICY IF EXISTS "Manage order items" ON public.order_items;


-- 8. Secure update_my_basic_profile SECURITY DEFINER function
-- Recreating it with fully schema-qualified references, search_path = '', and restricted execution
REVOKE EXECUTE ON FUNCTION public.update_my_basic_profile(text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_basic_profile(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_my_basic_profile(p_full_name text, p_phone text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    UPDATE public.profiles
    SET full_name = p_full_name,
        phone = p_phone
    WHERE id = auth.uid();
END;
$function$;
