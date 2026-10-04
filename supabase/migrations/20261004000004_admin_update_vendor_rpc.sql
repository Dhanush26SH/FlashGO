-- Migration: 20261004000004_admin_update_vendor_rpc.sql
-- Adds a secure RPC for admins to update existing vendors without violating RLS.

CREATE OR REPLACE FUNCTION public.admin_update_vendor(
    p_id uuid,
    p_name text,
    p_email text,
    p_contact_person text DEFAULT NULL::text,
    p_phone text DEFAULT NULL::text,
    p_address text DEFAULT NULL::text
)
 RETURNS vendors
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_vendor public.vendors;
BEGIN
    -- Explicitly verify the authenticated caller is an authorized Admin
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can update vendors';
    END IF;

    -- Vendor name must not be blank
    IF p_name IS NULL OR trim(p_name) = '' THEN
        RAISE EXCEPTION 'Vendor name is required';
    END IF;

    -- Validate vendor ID exists
    IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = p_id) THEN
        RAISE EXCEPTION 'Vendor not found';
    END IF;

    -- Update the EXISTING vendors row using its existing vendor UUID
    -- Trim text inputs
    UPDATE public.vendors 
    SET 
        name = trim(p_name), 
        email = COALESCE(trim(p_email), ''), 
        contact_person = COALESCE(trim(p_contact_person), ''), 
        phone = COALESCE(trim(p_phone), ''), 
        address = COALESCE(trim(p_address), '')
    WHERE id = p_id
    RETURNING * INTO v_vendor;

    RETURN v_vendor;
END;
$function$;
