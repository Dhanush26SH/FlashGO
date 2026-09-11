-- 1. Add country_of_origin to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS country_of_origin TEXT;

-- 2. Insert Decor products into Home & Lifestyle
-- Get the Home & Lifestyle category id
DO $$
DECLARE
    v_home_cat_id UUID;
    v_decor_1 UUID := gen_random_uuid();
    v_decor_2 UUID := gen_random_uuid();
    v_decor_3 UUID := gen_random_uuid();
    v_decor_4 UUID := gen_random_uuid();
    v_udupi UUID := '9f4d3149-f3e4-432b-98b6-f17af77c9c33';
    v_manipal UUID := '76525a09-3fd1-4949-b45e-49c77255b4ce';
BEGIN
    SELECT id INTO v_home_cat_id FROM public.categories WHERE name = 'Home & Lifestyle' LIMIT 1;
    
    IF v_home_cat_id IS NOT NULL THEN
        -- Insert Products
        INSERT INTO public.products (id, category_id, name, description, price, sku, barcode, tags, is_active, stock_quantity, warehouse_location, image_url)
        VALUES 
        (v_decor_1, v_home_cat_id, 'Aromatic Scented Candles', 'Set of 3 aromatic candles', 299, 'DEC-CANDLE-01', '8901234567891', ARRAY['decor'], true, 100, 'A1', null),
        (v_decor_2, v_home_cat_id, 'Glass Flower Vase', 'Elegant glass flower vase', 499, 'DEC-VASE-01', '8901234567892', ARRAY['decor'], true, 50, 'A2', null),
        (v_decor_3, v_home_cat_id, 'Decorative Throw Cushion', 'Cotton decorative cushion cover', 399, 'DEC-CUSH-01', '8901234567893', ARRAY['decor'], true, 75, 'A3', null),
        (v_decor_4, v_home_cat_id, 'Indoor Succulent Planter', 'Ceramic succulent planter', 249, 'DEC-PLANTER-01', '8901234567894', ARRAY['decor'], true, 60, 'A4', null);
        
        -- Insert into warehouse_stock
        INSERT INTO public.warehouse_stock (warehouse_id, product_id, quantity)
        VALUES 
        (v_udupi, v_decor_1, 100), (v_manipal, v_decor_1, 100),
        (v_udupi, v_decor_2, 50), (v_manipal, v_decor_2, 50),
        (v_udupi, v_decor_3, 75), (v_manipal, v_decor_3, 75),
        (v_udupi, v_decor_4, 60), (v_manipal, v_decor_4, 60);

        -- Insert into product_batches
        INSERT INTO public.product_batches (warehouse_id, product_id, batch_number, expiry_date, received_quantity, available_quantity, status)
        VALUES
        (v_udupi, v_decor_1, 'BAT-UDP-CANDLE', now() + interval '1 year', 100, 100, 'active'),
        (v_manipal, v_decor_1, 'BAT-MPL-CANDLE', now() + interval '1 year', 100, 100, 'active'),
        (v_udupi, v_decor_2, 'BAT-UDP-VASE', now() + interval '1 year', 50, 50, 'active'),
        (v_manipal, v_decor_2, 'BAT-MPL-VASE', now() + interval '1 year', 50, 50, 'active'),
        (v_udupi, v_decor_3, 'BAT-UDP-CUSH', now() + interval '1 year', 75, 75, 'active'),
        (v_manipal, v_decor_3, 'BAT-MPL-CUSH', now() + interval '1 year', 75, 75, 'active'),
        (v_udupi, v_decor_4, 'BAT-UDP-PLANT', now() + interval '1 year', 60, 60, 'active'),
        (v_manipal, v_decor_4, 'BAT-MPL-PLANT', now() + interval '1 year', 60, 60, 'active');

        -- Insert into stock_ledgers
        INSERT INTO public.stock_ledgers (warehouse_id, product_id, quantity_change, reason)
        VALUES
        (v_udupi, v_decor_1, 100, 'grn'), (v_manipal, v_decor_1, 100, 'grn'),
        (v_udupi, v_decor_2, 50, 'grn'), (v_manipal, v_decor_2, 50, 'grn'),
        (v_udupi, v_decor_3, 75, 'grn'), (v_manipal, v_decor_3, 75, 'grn'),
        (v_udupi, v_decor_4, 60, 'grn'), (v_manipal, v_decor_4, 60, 'grn');
    END IF;
END $$;
