-- Fix incorrect banana image for 24 Mantra Organic Brown Rice
UPDATE products 
SET image_url = NULL 
WHERE name ILIKE '%Mantra Organic Brown Rice%';
