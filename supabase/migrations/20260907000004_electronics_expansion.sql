-- Migration: 20260907000004_electronics_expansion.sql
DO $$
DECLARE
    v_elec_cat_id UUID;
    v_kitchen_cat_id UUID;
    
    v_sub_mobile UUID;
    v_sub_charging UUID;
    v_sub_audio UUID;
    v_sub_computer UUID;
    v_sub_grooming UUID;
    v_sub_batteries UUID;
    v_sub_lighting UUID;
    
    v_sub_appliances UUID;
    
    v_udupi UUID := '9f4d3149-f3e4-432b-98b6-f17af77c9c33';
    v_manipal UUID := '76525a09-3fd1-4949-b45e-49c77255b4ce';
    
    v_product_id UUID;
BEGIN
    -- Get Categories
    SELECT id INTO v_elec_cat_id FROM public.categories WHERE name = 'Electronics & Accessories' LIMIT 1;
    SELECT id INTO v_kitchen_cat_id FROM public.categories WHERE name = 'Kitchenware & Appliances' LIMIT 1;
    
    -- Subcategories under Electronics
    SELECT id INTO v_sub_mobile FROM public.subcategories WHERE name = 'Mobile Accessories' AND category_id = v_elec_cat_id LIMIT 1;
    IF v_sub_mobile IS NULL THEN
        v_sub_mobile := gen_random_uuid();
        INSERT INTO public.subcategories (id, category_id, name) VALUES (v_sub_mobile, v_elec_cat_id, 'Mobile Accessories');
    END IF;
    
    SELECT id INTO v_sub_batteries FROM public.subcategories WHERE name = 'Batteries' AND category_id = v_elec_cat_id LIMIT 1;
    IF v_sub_batteries IS NULL THEN
        v_sub_batteries := gen_random_uuid();
        INSERT INTO public.subcategories (id, category_id, name) VALUES (v_sub_batteries, v_elec_cat_id, 'Batteries');
    END IF;
    
    SELECT id INTO v_sub_lighting FROM public.subcategories WHERE name = 'Lighting' AND category_id = v_elec_cat_id LIMIT 1;
    IF v_sub_lighting IS NULL THEN
        v_sub_lighting := gen_random_uuid();
        INSERT INTO public.subcategories (id, category_id, name) VALUES (v_sub_lighting, v_elec_cat_id, 'Lighting');
    END IF;

    -- New Electronics subcategories
    v_sub_charging := gen_random_uuid();
    INSERT INTO public.subcategories (id, category_id, name) VALUES (v_sub_charging, v_elec_cat_id, 'Charging & Cables');
    
    v_sub_audio := gen_random_uuid();
    INSERT INTO public.subcategories (id, category_id, name) VALUES (v_sub_audio, v_elec_cat_id, 'Earphones & Audio');
    
    v_sub_computer := gen_random_uuid();
    INSERT INTO public.subcategories (id, category_id, name) VALUES (v_sub_computer, v_elec_cat_id, 'Computer Accessories');
    
    v_sub_grooming := gen_random_uuid();
    INSERT INTO public.subcategories (id, category_id, name) VALUES (v_sub_grooming, v_elec_cat_id, 'Grooming Electronics');
    
    -- Kitchenware Subcategory
    SELECT id INTO v_sub_appliances FROM public.subcategories WHERE name = 'Appliances' AND category_id = v_kitchen_cat_id LIMIT 1;
    IF v_sub_appliances IS NULL THEN
        v_sub_appliances := gen_random_uuid();
        INSERT INTO public.subcategories (id, category_id, name) VALUES (v_sub_appliances, v_kitchen_cat_id, 'Appliances');
    END IF;

    -- Update existing 6 electronics
    UPDATE public.products SET subcategory_id = v_sub_audio WHERE name = 'boAt BassHeads 100 Wired Earphones';
    UPDATE public.products SET subcategory_id = v_sub_charging WHERE name = 'Portronics Konnect L USB Type-C Cable';
    UPDATE public.products SET subcategory_id = v_sub_charging WHERE name = 'Syska Power Bank P1001';
    
    -- New Products insertion
    -- We will insert each product and immediately add stock/batch/ledger
    CREATE TEMP TABLE tmp_new_products (
        id UUID DEFAULT gen_random_uuid(),
        category_id UUID,
        subcategory_id UUID,
        name TEXT,
        price NUMERIC,
        discount_price NUMERIC,
        sku TEXT,
        barcode TEXT
    );

    INSERT INTO tmp_new_products (category_id, subcategory_id, name, price, discount_price, sku, barcode) VALUES
    -- Charging & Cables
    (v_elec_cat_id, v_sub_charging, 'Apple 20W USB-C Power Adapter', 1900, 1799, 'ELEC-APP-20W', '890ELEC001'),
    (v_elec_cat_id, v_sub_charging, 'OnePlus Type-C Cable', 399, 349, 'ELEC-OP-CBL', '890ELEC002'),
    (v_elec_cat_id, v_sub_charging, 'Mi 10000mAh Power Bank', 1299, 1199, 'ELEC-MI-PB', '890ELEC003'),
    (v_elec_cat_id, v_sub_charging, 'Ambrane 20W Dual Port Charger', 799, 499, 'ELEC-AMB-CHG', '890ELEC004'),
    -- Earphones & Audio
    (v_elec_cat_id, v_sub_audio, 'boAt Airdopes 141', 4490, 1299, 'ELEC-BOAT-141', '890ELEC005'),
    (v_elec_cat_id, v_sub_audio, 'Sony MDR-ZX110A Wired Headphones', 1390, 999, 'ELEC-SONY-MDR', '890ELEC006'),
    (v_elec_cat_id, v_sub_audio, 'JBL Go 2 Bluetooth Speaker', 2999, 1999, 'ELEC-JBL-GO2', '890ELEC007'),
    (v_elec_cat_id, v_sub_audio, 'Zebronics Zeb-Bro Earphones', 399, 299, 'ELEC-ZEB-BRO', '890ELEC008'),
    -- Grooming
    (v_elec_cat_id, v_sub_grooming, 'Philips Trimmer QP2525', 1999, 1699, 'ELEC-PHIL-TRIM', '890ELEC009'),
    (v_elec_cat_id, v_sub_grooming, 'Vega Hair Straightener', 1199, 949, 'ELEC-VEGA-STR', '890ELEC010'),
    (v_elec_cat_id, v_sub_grooming, 'Panasonic Hair Dryer', 890, 749, 'ELEC-PAN-HDRY', '890ELEC011'),
    -- Computer Accessories
    (v_elec_cat_id, v_sub_computer, 'SanDisk 64GB USB Flash Drive', 700, 499, 'ELEC-SAND-64G', '890ELEC012'),
    (v_elec_cat_id, v_sub_computer, 'HP Wireless Mouse 200', 799, 649, 'ELEC-HP-MSE', '890ELEC013'),
    (v_elec_cat_id, v_sub_computer, 'Logitech K230 Wireless Keyboard', 1199, 999, 'ELEC-LOGI-KBD', '890ELEC014'),
    -- Mobile Accessories
    (v_elec_cat_id, v_sub_mobile, 'Spigen iPhone 15 Case', 1499, 999, 'ELEC-SPIG-15C', '890ELEC015'),
    (v_elec_cat_id, v_sub_mobile, 'Noise ColorFit Pro 4 Smartwatch', 5999, 2499, 'ELEC-NOIS-PRO4', '890ELEC016'),
    -- Batteries
    (v_elec_cat_id, v_sub_batteries, 'Duracell AAA Batteries 4-Pack', 170, 150, 'ELEC-DUR-AAA4', '890ELEC017'),
    (v_elec_cat_id, v_sub_batteries, 'Eveready AA Batteries 10-Pack', 200, 175, 'ELEC-EVR-AA10', '890ELEC018'),
    -- Lighting
    (v_elec_cat_id, v_sub_lighting, 'Philips 12W LED Bulb', 220, 180, 'ELEC-PHIL-12W', '890ELEC019'),
    (v_elec_cat_id, v_sub_lighting, 'Wipro Smart LED Bulb 9W', 1500, 599, 'ELEC-WIPRO-9W', '890ELEC020'),
    -- Kitchenware
    (v_kitchen_cat_id, v_sub_appliances, 'Pigeon Electric Kettle 1.5L', 1195, 649, 'KITCH-PIG-KET', '890KITCH001'),
    (v_kitchen_cat_id, v_sub_appliances, 'Bajaj Rex 500W Mixer Grinder', 3200, 2099, 'KITCH-BAJ-MIX', '890KITCH002'),
    (v_kitchen_cat_id, v_sub_appliances, 'Prestige Sandwich Maker', 1595, 1199, 'KITCH-PRES-SAND', '890KITCH003'),
    (v_kitchen_cat_id, v_sub_appliances, 'Morphy Richards Iron', 995, 799, 'KITCH-MORP-IRN', '890KITCH004');

    -- Insert products
    INSERT INTO public.products (
        id, category_id, subcategory_id, name, description, price, discount_price, sku, barcode, tags, is_active, image_url
    )
    SELECT 
        id, category_id, subcategory_id, name, name, price, discount_price, sku, barcode, ARRAY[]::text[], true, null
    FROM tmp_new_products;

    -- Insert warehouse_stock (Udupi & Manipal)
    INSERT INTO public.warehouse_stock (warehouse_id, product_id, quantity)
    SELECT v_udupi, id, 50 FROM tmp_new_products
    UNION ALL
    SELECT v_manipal, id, 50 FROM tmp_new_products;

    -- Insert product_batches
    INSERT INTO public.product_batches (warehouse_id, product_id, batch_number, expiry_date, received_quantity, available_quantity, status)
    SELECT v_udupi, id, 'BAT-UDP-' || sku, now() + interval '2 years', 50, 50, 'active' FROM tmp_new_products
    UNION ALL
    SELECT v_manipal, id, 'BAT-MPL-' || sku, now() + interval '2 years', 50, 50, 'active' FROM tmp_new_products;

    -- Insert stock_ledgers
    INSERT INTO public.stock_ledgers (warehouse_id, product_id, quantity_change, reason)
    SELECT v_udupi, id, 50, 'grn' FROM tmp_new_products
    UNION ALL
    SELECT v_manipal, id, 50, 'grn' FROM tmp_new_products;

    DROP TABLE tmp_new_products;

END $$;
