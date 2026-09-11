-- 20260904000005_insert_missing_categories.sql
-- Insert the remaining 20 categories to reach the 26 promised in the catalog expansion.

INSERT INTO public.categories (id, name, slug, icon, active) VALUES
(gen_random_uuid(), 'Atta, Rice & Dal', 'atta-rice-dal', 'Wheat', true),
(gen_random_uuid(), 'Oil, Ghee & Masala', 'oil-ghee-masala', 'Droplet', true),
(gen_random_uuid(), 'Bakery & Biscuits', 'bakery-biscuits', 'Croissant', true),
(gen_random_uuid(), 'Chips & Namkeen', 'chips-namkeen', 'Cookie', true),
(gen_random_uuid(), 'Drinks & Juices', 'drinks-juices', 'CupSoda', true),
(gen_random_uuid(), 'Tea, Coffee & Milk Drinks', 'tea-coffee-milk', 'Coffee', true),
(gen_random_uuid(), 'Instant Food', 'instant-food', 'Utensils', true),
(gen_random_uuid(), 'Sweets & Chocolates', 'sweets-chocolates', 'Candy', true),
(gen_random_uuid(), 'Ice Creams & Frozen Food', 'ice-creams-frozen', 'IceCream', true),
(gen_random_uuid(), 'Sauces & Spreads', 'sauces-spreads', 'Jar', true),
(gen_random_uuid(), 'Chicken, Meat & Fish', 'chicken-meat-fish', 'Drumstick', true),
(gen_random_uuid(), 'Bath & Body', 'bath-body', 'Bath', true),
(gen_random_uuid(), 'Hair Care', 'hair-care', 'Scissors', true),
(gen_random_uuid(), 'Skin & Face', 'skin-face', 'Sparkles', true),
(gen_random_uuid(), 'Beauty & Cosmetics', 'beauty-cosmetics', 'Palette', true),
(gen_random_uuid(), 'Feminine Hygiene', 'feminine-hygiene', 'Heart', true),
(gen_random_uuid(), 'Baby Care', 'baby-care', 'BabyCarriage', true),
(gen_random_uuid(), 'Health & Wellness', 'health-wellness', 'Activity', true),
(gen_random_uuid(), 'Cleaners & Repellents', 'cleaners-repellents', 'Shield', true),
(gen_random_uuid(), 'Home & Lifestyle', 'home-lifestyle', 'Home', true),
(gen_random_uuid(), 'Kitchenware & Appliances', 'kitchenware-appliances', 'Microwave', true),
(gen_random_uuid(), 'Stationery & Games', 'stationery-games', 'Gamepad2', true),
(gen_random_uuid(), 'Electronics & Accessories', 'electronics-accessories', 'Smartphone', true),
(gen_random_uuid(), 'Pet Care', 'pet-care', 'Dog', true)
ON CONFLICT DO NOTHING;
