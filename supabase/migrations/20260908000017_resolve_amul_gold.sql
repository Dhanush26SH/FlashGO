-- Deactivate legacy Row 1
UPDATE public.products SET is_active = false WHERE id = '888f7899-2f74-4d18-a2b5-dfce6c354287';

-- Set canonical Row 2 image URL
UPDATE public.products SET image_url = 'https://szpfuommfvrfdliloxcg.supabase.co/storage/v1/object/public/product-images/products/9701ec5a-3fa0-4503-8404-3e6ce538fdaa/amulgoldfullcreammilk.jpg' WHERE id = '9701ec5a-3fa0-4503-8404-3e6ce538fdaa';
