-- 20260909000003_fix_duplicate_puredairy_vendor.sql

DO $$
DECLARE
    v_original_id UUID := 'b0000000-0000-0000-0000-000000000002';
    v_duplicate_id UUID := '31b51e4f-46f3-4714-8f75-010a9e64432c';
    v_po_count INT;
    v_vp_count INT;
BEGIN
    -- Verify the duplicate exists and original exists
    IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = v_duplicate_id) THEN
        RAISE NOTICE 'Duplicate vendor not found, skipping.';
        RETURN;
    END IF;

    -- Move mappings from duplicate to original idempotently
    -- ON CONFLICT DO NOTHING handles if some were already mapped
    INSERT INTO public.vendor_products (vendor_id, product_id, is_active, minimum_order_quantity)
    SELECT v_original_id, product_id, is_active, minimum_order_quantity
    FROM public.vendor_products
    WHERE vendor_id = v_duplicate_id
    ON CONFLICT (vendor_id, product_id) DO NOTHING;

    -- Delete the mappings from duplicate
    DELETE FROM public.vendor_products WHERE vendor_id = v_duplicate_id;

    -- Verify no dependencies exist for the duplicate
    SELECT COUNT(*) INTO v_po_count FROM public.procurement_orders WHERE vendor_id = v_duplicate_id;
    IF v_po_count > 0 THEN
        RAISE EXCEPTION 'Cannot delete duplicate vendor % because it has % POs', v_duplicate_id, v_po_count;
    END IF;
    
    SELECT COUNT(*) INTO v_vp_count FROM public.vendor_products WHERE vendor_id = v_duplicate_id;
    IF v_vp_count > 0 THEN
        RAISE EXCEPTION 'Cannot delete duplicate vendor % because mappings still exist', v_duplicate_id;
    END IF;

    -- Safe to delete the duplicate vendor
    DELETE FROM public.vendors WHERE id = v_duplicate_id;
END $$;
