-- 20260905000024_assign_correct_images.sql

-- 1. Reset all images to NULL to ensure no unrelated images exist
UPDATE products SET image_url = NULL;

-- 2. Map verified images from product-images bucket
UPDATE products SET image_url = 'https://szpfuommfvrfdliloxcg.supabase.co/storage/v1/object/public/product-images/products/p1.jpg' WHERE name ILIKE '%Banana%';
UPDATE products SET image_url = 'https://szpfuommfvrfdliloxcg.supabase.co/storage/v1/object/public/product-images/products/p2.jpg' WHERE name ILIKE '%Apple Royal Gala%';
UPDATE products SET image_url = 'https://szpfuommfvrfdliloxcg.supabase.co/storage/v1/object/public/product-images/products/p4.jpg' WHERE name ILIKE '%Cucumber%';
UPDATE products SET image_url = 'https://szpfuommfvrfdliloxcg.supabase.co/storage/v1/object/public/product-images/products/p5.jpg' WHERE name ILIKE '%Amul Taaza Toned Milk%';
