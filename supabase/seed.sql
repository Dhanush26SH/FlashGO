-- SQL Seed File: FlashGO Mock Data Seed
-- Execute this after setting up migrations to populate mock categories, products, and coupons.

-- 1. Seed Categories
INSERT INTO public.categories (id, name, slug, icon, active) VALUES
('c0000000-0000-0000-0000-000000000001', 'Fruits & Vegetables', 'fruits-vegetables', 'Apple', true),
('c0000000-0000-0000-0000-000000000002', 'Dairy, Bread & Eggs', 'dairy-bread-eggs', 'Milk', true),
('c0000000-0000-0000-0000-000000000003', 'Snacks & Munchies', 'snacks-munchies', 'Cookie', true),
('c0000000-0000-0000-0000-000000000004', 'Cold Drinks & Juices', 'cold-drinks-juices', 'CupSoda', true),
('c0000000-0000-0000-0000-000000000005', 'Household Essentials', 'household-essentials', 'Sparkles', true),
('c0000000-0000-0000-0000-000000000006', 'Personal Care', 'personal-care', 'Heart', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Seed Vendors
INSERT INTO public.vendors (id, name, contact_person, email, phone, address) VALUES
('v0000000-0000-0000-0000-000000000001', 'FreshFarm Agro Industries', 'Robert Green', 'robert@freshfarm.com', '+15550101', 'Greenfield Farms, Aisle 10'),
('v0000000-0000-0000-0000-000000000002', 'PureDairy Co.', 'Sarah Milk', 'sarah@puredairy.com', '+15550102', 'Grasslands Dairy Valley'),
('v0000000-0000-0000-0000-000000000003', 'MegaCrunch Foods', 'David Baker', 'david@megacrunch.com', '+15550103', 'Industrial Bakery Hub B4')
ON CONFLICT (id) DO NOTHING;

-- 3. Seed Products
INSERT INTO public.products (id, category_id, name, description, price, discount_price, sku, barcode, image_url, stock_quantity, warehouse_location, rating_avg, rating_count) VALUES
-- Fruits & Veggies
('p0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Fresh Organic Bananas', 'Premium organic sweet bananas from local farms. Bunch of 6.', 2.99, 2.49, 'SKU-FR-BAN', '012345678901', 'bananas.png', 45, 'A-R1-S1', 4.8, 120),
('p0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'Red Gala Apples', 'Crisp and sweet red gala apples. Pack of 4.', 4.49, 3.99, 'SKU-FR-APL', '012345678902', 'apples.png', 30, 'A-R1-S2', 4.6, 95),
('p0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'Hydroponic Cherry Tomatoes', 'Juicy and sweet red cherry tomatoes. 250g box.', 3.49, NULL, 'SKU-VG-TOM', '012345678903', 'tomatoes.png', 18, 'A-R2-S1', 4.9, 45),

-- Dairy, Bread & Eggs
('p0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002', 'Whole Pasteurised Milk', 'Fresh full-cream farm pasteurised milk. 1 Liter.', 1.99, 1.79, 'SKU-DY-MILK', '012345678904', 'milk.png', 50, 'B-R1-S1', 4.7, 340),
('p0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'Salted Butter', 'Rich and creamy farm churned salted butter. 200g.', 3.99, 3.49, 'SKU-DY-BTR', '012345678905', 'butter.png', 25, 'B-R1-S2', 4.5, 210),
('p0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000002', 'Sourdough Bread Loaf', 'Freshly baked artisanal crusty sourdough bread. 400g.', 4.99, NULL, 'SKU-BD-SOUR', '012345678906', 'sourdough.png', 12, 'B-R2-S1', 4.9, 85),

-- Snacks & Munchies
('p0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000003', 'Classic Potato Chips', 'Crispy thin sea salt potato chips. 150g party bag.', 2.49, 1.99, 'SKU-SN-CHIP', '012345678907', 'chips.png', 80, 'C-R1-S1', 4.4, 520),
('p0000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000003', 'Double Chocolate Cookies', 'Fudgey double chocolate chip cookies. Pack of 6.', 3.99, 3.29, 'SKU-SN-COOK', '012345678908', 'cookies.png', 40, 'C-R1-S2', 4.8, 180),

-- Cold Drinks & Juices
('p0000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000004', 'Sparkling Lime Water', 'Refreshing calorie-free sparkling water with lime. 330ml.', 1.49, 1.25, 'SKU-DR-SPRK', '012345678909', 'limewater.png', 120, 'D-R1-S1', 4.3, 150),
('p0000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000004', 'Cold Pressed Orange Juice', '100%% pure squeezed orange juice with pulp. 500ml.', 4.99, 4.49, 'SKU-DR-ORNG', '012345678910', 'orangejuice.png', 35, 'D-R1-S2', 4.8, 230),

-- Household Essentials
('p0000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000005', 'Eco Dishwash Liquid', 'Tough on grease, gentle on hands. Organic lemon. 500ml.', 3.49, NULL, 'SKU-HH-DISH', '012345678911', 'dishwash.png', 50, 'E-R1-S1', 4.5, 75),
('p0000000-0000-0000-0000-000000000012', 'c0000000-0000-0000-0000-000000000005', 'Ultra Soft Toilet Tissue', '3-ply premium bamboo fiber toilet tissue. Pack of 4 rolls.', 5.99, 4.99, 'SKU-HH-TISS', '012345678912', 'tissue.png', 65, 'E-R2-S1', 4.7, 190)
ON CONFLICT (id) DO NOTHING;

-- 4. Seed Coupons
INSERT INTO public.coupons (id, code, discount_type, discount_value, min_order_value, max_discount, active) VALUES
('cp000000-0000-0000-0000-000000000001', 'FLASH20', 'percentage', 20.00, 10.00, 10.00, true),
('cp000000-0000-0000-0000-000000000002', 'FREESHIP', 'flat', 3.00, 15.00, 3.00, true),
('cp000000-0000-0000-0000-000000000003', 'GO50', 'flat', 5.00, 25.00, 5.00, true)
ON CONFLICT (id) DO NOTHING;

-- 5. Seed Slots
INSERT INTO public.slots (id, date, start_time, end_time, store_location, payout_min, payout_max, status) VALUES
('s0000000-0000-0000-0000-000000000001', '2026-08-03', '06:00:00', '08:00:00', 'Udupi service bus stand', 40, 255, 'open'),
('s0000000-0000-0000-0000-000000000002', '2026-08-03', '08:00:00', '10:00:00', 'Udupi service bus stand', 40, 255, 'open'),
('s0000000-0000-0000-0000-000000000003', '2026-08-04', '10:00:00', '12:00:00', 'Udupi service bus stand', 50, 255, 'open'),
('s0000000-0000-0000-0000-000000000004', '2026-08-04', '14:00:00', '16:00:00', 'Udupi service bus stand', 40, 255, 'open')
ON CONFLICT (id) DO NOTHING;
