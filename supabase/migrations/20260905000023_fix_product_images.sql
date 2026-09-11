-- 00023_fix_product_images.sql
-- Sets image_url to NULL for products that were assigned the generic 'c1.jpg' banana image.
-- This ensures they fall back to the bundled product-placeholder.png instead of an unrelated image.

UPDATE products 
SET image_url = NULL 
WHERE image_url LIKE '%c1.jpg%';
