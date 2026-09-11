-- 20260904000019_final_semantic_category_corrections.sql
-- Generated after explicit semantic review of all 209 products.
-- Target: szpfuommfvrfdliloxcg

DO $$
DECLARE
    prod_count int;
    wh_count int;
    wh_sum int;
    pb_count int;
    pb_sum int;
    ir_count int;
    ir_sum int;
    sl_count int;
    cat_count int;
BEGIN
    SELECT count(*) INTO prod_count FROM public.products;
    IF prod_count != 209 THEN RAISE EXCEPTION 'Products count != 209 (found %)', prod_count; END IF;

    SELECT count(*), coalesce(sum(quantity), 0) INTO wh_count, wh_sum FROM public.warehouse_stock;
    SELECT count(*), coalesce(sum(available_quantity), 0) INTO pb_count, pb_sum FROM public.product_batches;
    SELECT count(*), coalesce(sum(quantity), 0) INTO ir_count, ir_sum FROM public.inventory_reservations;
    SELECT count(*) INTO sl_count FROM public.stock_ledgers;
    SELECT count(*) INTO cat_count FROM public.categories;
    IF cat_count != 26 THEN RAISE EXCEPTION 'Categories count != 26 (found %)', cat_count; END IF;

    CREATE TEMP TABLE migration_stats AS
    SELECT wh_count as wc, wh_sum as ws, pb_count as pc, pb_sum as ps, ir_count as ic, ir_sum as isum, sl_count as sc;
END $$;

UPDATE public.products SET category_id = 'd11c0d26-3f6b-4e22-802f-13a6c46fec08' WHERE id = 'c6930628-f0b7-4de4-af53-153502948fd5';
UPDATE public.products SET category_id = 'a71f9f54-609b-4c28-a210-0b9b4527c75a' WHERE id = '2d99cb4d-0d28-42e0-a257-0639fba2ea3d';
UPDATE public.products SET category_id = 'd11c0d26-3f6b-4e22-802f-13a6c46fec08' WHERE id = '7e687737-2994-4559-8fa9-63df0f22f5ca';
UPDATE public.products SET category_id = 'a71f9f54-609b-4c28-a210-0b9b4527c75a' WHERE id = '3b20bd91-3df4-4294-8c4b-19bceb39e896';
UPDATE public.products SET category_id = 'a71f9f54-609b-4c28-a210-0b9b4527c75a' WHERE id = 'fa5ed270-2690-424b-9ce5-bdaa1ec1ad88';
UPDATE public.products SET category_id = 'a71f9f54-609b-4c28-a210-0b9b4527c75a' WHERE id = '98874d67-09a8-4f46-b71e-31c8bf5abe2e';
UPDATE public.products SET category_id = 'a71f9f54-609b-4c28-a210-0b9b4527c75a' WHERE id = '62556632-92ab-4d8e-bde8-c64c259b28cd';
UPDATE public.products SET category_id = '5b643fab-1b85-4f37-b156-c160cb09868d' WHERE id = '496dc8c8-0353-4217-b119-1309495997cd';
UPDATE public.products SET category_id = '40768ca9-9f11-4d62-a02d-77ffeba17f12' WHERE id = '27dd90d6-6c9d-4d14-9cdb-24d0629cf100';
UPDATE public.products SET category_id = '40768ca9-9f11-4d62-a02d-77ffeba17f12' WHERE id = 'dd5d51ad-48ba-4c66-bbee-78d21109b7e7';
UPDATE public.products SET category_id = '40768ca9-9f11-4d62-a02d-77ffeba17f12' WHERE id = '70710b4f-1aed-46f4-8641-ebd6c9b0b88c';
UPDATE public.products SET category_id = '06180b8b-ad91-42eb-a5de-8ae2a390463a' WHERE id = '11cec891-7324-4390-a4a2-d84bc3d17a5f';
UPDATE public.products SET category_id = 'b616d113-642b-47b1-acd3-c85e4da8df75' WHERE id = '8b7a1c4d-ef9f-4c99-9bb0-aa5f77d72274';
UPDATE public.products SET category_id = '9fce9dc0-9c64-4b1f-82b3-0e4b1cba9f4f' WHERE id = '8df20045-e729-4929-9191-7a6d2465f77f';
UPDATE public.products SET category_id = 'a819177f-448e-4e3e-871b-0fb694853058' WHERE id = 'bf224964-6ca4-46cb-a3ba-9a2329cadc8c';
UPDATE public.products SET category_id = '06180b8b-ad91-42eb-a5de-8ae2a390463a' WHERE id = '4b21729d-4384-4f30-a200-9237f21685dd';
UPDATE public.products SET category_id = 'b616d113-642b-47b1-acd3-c85e4da8df75' WHERE id = '91aa22b7-ecf4-49b9-9dee-34a937f95614';
UPDATE public.products SET category_id = 'b616d113-642b-47b1-acd3-c85e4da8df75' WHERE id = '1bd8eff3-abb5-4799-a70c-2215e7b3aecc';
UPDATE public.products SET category_id = '40768ca9-9f11-4d62-a02d-77ffeba17f12' WHERE id = '3554af00-0d47-47cb-9b56-6e11b8e645b9';
UPDATE public.products SET category_id = '8ebaa744-5930-4ffe-bcef-58449277dcaf' WHERE id = '25aa0b71-82f3-4ccd-8c38-4d127ba24cbc';
UPDATE public.products SET category_id = '06180b8b-ad91-42eb-a5de-8ae2a390463a' WHERE id = '6e16bc8d-4851-4b55-888a-886444dcc175';
UPDATE public.products SET category_id = 'b616d113-642b-47b1-acd3-c85e4da8df75' WHERE id = '156678e7-d5dc-4f3a-b0ba-1f8f739ffdeb';
UPDATE public.products SET category_id = 'a819177f-448e-4e3e-871b-0fb694853058' WHERE id = '569844e4-6a2d-4cc9-8066-027f8fd4468f';
UPDATE public.products SET category_id = 'a819177f-448e-4e3e-871b-0fb694853058' WHERE id = 'd2f4c71e-9166-4655-ab8a-f2be6696e274';
UPDATE public.products SET category_id = 'daa11eb2-573b-4576-a04d-7e1ee4efc3a8' WHERE id = 'eb43237c-1288-41f3-91a9-46fd95f3b503';
UPDATE public.products SET category_id = 'a819177f-448e-4e3e-871b-0fb694853058' WHERE id = '4b93141d-4306-4cf7-87ca-5985faae9541';
UPDATE public.products SET category_id = '1717ebc5-4cd0-4ef2-b670-200d82756d5b' WHERE id = '67e79d11-8772-4962-95c9-f747ee111e21';
UPDATE public.products SET category_id = '0411abdd-af0f-4534-a0e2-45d821cd4983' WHERE id = '02bd6c6a-598e-4ed6-b7e1-0e81d2f806fd';

DO $$
DECLARE
    wh_count int;
    wh_sum int;
    pb_count int;
    pb_sum int;
    ir_count int;
    ir_sum int;
    sl_count int;
    stats RECORD;
BEGIN
    SELECT * INTO stats FROM migration_stats;

    SELECT count(*), coalesce(sum(quantity), 0) INTO wh_count, wh_sum FROM public.warehouse_stock;
    IF wh_count != stats.wc OR wh_sum != stats.ws THEN RAISE EXCEPTION 'warehouse_stock mutated'; END IF;

    SELECT count(*), coalesce(sum(available_quantity), 0) INTO pb_count, pb_sum FROM public.product_batches;
    IF pb_count != stats.pc OR pb_sum != stats.ps THEN RAISE EXCEPTION 'product_batches mutated'; END IF;

    SELECT count(*), coalesce(sum(quantity), 0) INTO ir_count, ir_sum FROM public.inventory_reservations;
    IF ir_count != stats.ic OR ir_sum != stats.isum THEN RAISE EXCEPTION 'inventory_reservations mutated'; END IF;

    SELECT count(*) INTO sl_count FROM public.stock_ledgers;
    IF sl_count != stats.sc THEN RAISE EXCEPTION 'stock_ledgers mutated'; END IF;

    DROP TABLE migration_stats;
END $$;
