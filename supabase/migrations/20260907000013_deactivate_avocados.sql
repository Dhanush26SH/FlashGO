-- Migration to deactivate duplicate Fresh Hass Avocados

UPDATE products SET is_active = false WHERE id = 'c0280122-72bb-44db-adf4-fa83fff8e711';
UPDATE products SET is_active = false WHERE id = 'b02adc28-4003-4bf3-8099-d90608ce1524';
UPDATE products SET is_active = false WHERE id = '89f2c3bc-2925-44a6-98d6-157672dcff10';
UPDATE products SET is_active = false WHERE id = '1928bbee-3990-4a72-93e9-5af9c2037d46';
UPDATE products SET is_active = false WHERE id = 'cbfd7337-1bc3-429e-b1e2-8ec8a68c2bbc';
