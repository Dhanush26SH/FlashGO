-- Migration to update batch 1 product images and cleanup policies

DROP POLICY IF EXISTS "Anon Temp Insert" ON storage.objects;
DROP POLICY IF EXISTS "Anon Temp Update" ON storage.objects;

UPDATE products SET image_url = 'https://szpfuommfvrfdliloxcg.supabase.co/storage/v1/object/public/product-images/products/96d06549-2560-4d37-914c-1b2c80ec90c5/britannia-bourbon-the-original.jpg' WHERE id = '96d06549-2560-4d37-914c-1b2c80ec90c5';
UPDATE products SET image_url = 'https://szpfuommfvrfdliloxcg.supabase.co/storage/v1/object/public/product-images/products/bd4afaeb-5736-4374-94d7-c4d550584b3b/britannia-good-day-cashew-cookies.jpg' WHERE id = 'bd4afaeb-5736-4374-94d7-c4d550584b3b';
UPDATE products SET image_url = 'https://szpfuommfvrfdliloxcg.supabase.co/storage/v1/object/public/product-images/products/bf40d6ec-67a1-48af-951a-e8ddb935d5be/britannia-marie-gold-biscuits.jpg' WHERE id = 'bf40d6ec-67a1-48af-951a-e8ddb935d5be';
UPDATE products SET image_url = 'https://szpfuommfvrfdliloxcg.supabase.co/storage/v1/object/public/product-images/products/3122b6ac-deac-4d74-a8e9-35983ac6b4a6/cadbury-oreo-vanilla-creme-biscuits.jpg' WHERE id = '3122b6ac-deac-4d74-a8e9-35983ac6b4a6';
UPDATE products SET image_url = 'https://szpfuommfvrfdliloxcg.supabase.co/storage/v1/object/public/product-images/products/4b21729d-4384-4f30-a200-9237f21685dd/himalaya-gentle-baby-shampoo.jpg' WHERE id = '4b21729d-4384-4f30-a200-9237f21685dd';
UPDATE products SET image_url = 'https://szpfuommfvrfdliloxcg.supabase.co/storage/v1/object/public/product-images/products/626189de-6245-46e0-bc6c-f5bc73ccb0b0/huggies-complete-comfort-wonder-pants-medium.jpg' WHERE id = '626189de-6245-46e0-bc6c-f5bc73ccb0b0';
UPDATE products SET image_url = 'https://szpfuommfvrfdliloxcg.supabase.co/storage/v1/object/public/product-images/products/11cec891-7324-4390-a4a2-d84bc3d17a5f/johnson-s-baby-lotion.jpg' WHERE id = '11cec891-7324-4390-a4a2-d84bc3d17a5f';
UPDATE products SET image_url = 'https://szpfuommfvrfdliloxcg.supabase.co/storage/v1/object/public/product-images/products/e5f6a7b7-9561-4221-b180-e250bd8495fc/johnson-s-baby-powder.jpg' WHERE id = 'e5f6a7b7-9561-4221-b180-e250bd8495fc';
UPDATE products SET image_url = 'https://szpfuommfvrfdliloxcg.supabase.co/storage/v1/object/public/product-images/products/83ba14ff-77e0-4bc8-a05b-398e598c2f9e/mee-mee-baby-wet-wipes.jpg' WHERE id = '83ba14ff-77e0-4bc8-a05b-398e598c2f9e';
UPDATE products SET image_url = 'https://szpfuommfvrfdliloxcg.supabase.co/storage/v1/object/public/product-images/products/6e16bc8d-4851-4b55-888a-886444dcc175/nestl-cerelac-wheat-apple-baby-cereal.jpg' WHERE id = '6e16bc8d-4851-4b55-888a-886444dcc175';
UPDATE products SET image_url = 'https://szpfuommfvrfdliloxcg.supabase.co/storage/v1/object/public/product-images/products/995f743c-8fd8-420d-a784-c088a45d2b2f/pampers-all-round-protection-pants-large.jpg' WHERE id = '995f743c-8fd8-420d-a784-c088a45d2b2f';
UPDATE products SET image_url = 'https://szpfuommfvrfdliloxcg.supabase.co/storage/v1/object/public/product-images/products/f8e426c2-191c-4a1f-8436-39886dc9cd92/parle-g-original-glucose-biscuits.jpg' WHERE id = 'f8e426c2-191c-4a1f-8436-39886dc9cd92';
UPDATE products SET image_url = 'https://szpfuommfvrfdliloxcg.supabase.co/storage/v1/object/public/product-images/products/7c3db5d9-49d4-43bd-8a66-211c0f883b49/sunfeast-dark-fantasy-choco-fills.jpg' WHERE id = '7c3db5d9-49d4-43bd-8a66-211c0f883b49';
UPDATE products SET image_url = 'https://szpfuommfvrfdliloxcg.supabase.co/storage/v1/object/public/product-images/products/33d41094-f940-4257-9a41-ed88d7438896/unibic-choco-chip-cookies.jpg' WHERE id = '33d41094-f940-4257-9a41-ed88d7438896';
