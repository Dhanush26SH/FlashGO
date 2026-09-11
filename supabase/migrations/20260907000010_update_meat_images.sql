-- Migration to update Chicken, Meat & Fish product images

UPDATE products SET image_url = 'https://szpfuommfvrfdliloxcg.supabase.co/storage/v1/object/public/product-images/products/6b0e91df-7fdb-466b-a947-d07b512b95cb/chickenbreastboneless.jpg' WHERE id = '6b0e91df-7fdb-466b-a947-d07b512b95cb';
UPDATE products SET image_url = 'https://szpfuommfvrfdliloxcg.supabase.co/storage/v1/object/public/product-images/products/d9be942d-bbfa-4036-9fe2-38783a29a45b/chickencurrycut.jpg' WHERE id = 'd9be942d-bbfa-4036-9fe2-38783a29a45b';
UPDATE products SET image_url = 'https://szpfuommfvrfdliloxcg.supabase.co/storage/v1/object/public/product-images/products/c32a0154-b43b-49f6-b3bd-651ec83437d2/chickendrumsticks.jpg' WHERE id = 'c32a0154-b43b-49f6-b3bd-651ec83437d2';
UPDATE products SET image_url = 'https://szpfuommfvrfdliloxcg.supabase.co/storage/v1/object/public/product-images/products/9cfa0233-6e3f-4504-aa1c-b7f418e532ba/muttoncurrycut.jpg' WHERE id = '9cfa0233-6e3f-4504-aa1c-b7f418e532ba';
UPDATE products SET image_url = 'https://szpfuommfvrfdliloxcg.supabase.co/storage/v1/object/public/product-images/products/38b25429-3534-4027-a331-d1abf768266e/prawnscleaned.jpg' WHERE id = '38b25429-3534-4027-a331-d1abf768266e';
UPDATE products SET image_url = 'https://szpfuommfvrfdliloxcg.supabase.co/storage/v1/object/public/product-images/products/0e8e7090-cda6-40f8-8ef7-8813410cc2d5/rohufishcurrycut.jpg' WHERE id = '0e8e7090-cda6-40f8-8ef7-8813410cc2d5';
UPDATE products SET image_url = 'https://szpfuommfvrfdliloxcg.supabase.co/storage/v1/object/public/product-images/products/eb43237c-1288-41f3-91a9-46fd95f3b503/seerfishsteaks.jpg' WHERE id = 'eb43237c-1288-41f3-91a9-46fd95f3b503';
