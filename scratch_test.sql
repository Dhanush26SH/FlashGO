DO $$
DECLARE
    v_udupi_wh_id UUID;
    v_udupi_driver_id UUID;
    v_count INT;
BEGIN
    SELECT id INTO v_udupi_wh_id FROM public.warehouses WHERE name ILIKE '%Udupi%' LIMIT 1;
    
    SELECT id INTO v_udupi_driver_id FROM public.driver_onboarding WHERE warehouse_id = v_udupi_wh_id AND status = 'submitted' LIMIT 1;
    IF v_udupi_driver_id IS NULL THEN
       SELECT id INTO v_udupi_driver_id FROM public.driver_onboarding WHERE warehouse_id = v_udupi_wh_id LIMIT 1;
    END IF;

    SELECT COUNT(*) INTO v_count FROM public.driver_payout_details WHERE driver_id = v_udupi_driver_id;
    RAISE EXCEPTION 'Udupi Driver Payout Count: %', v_count;
END $$;
