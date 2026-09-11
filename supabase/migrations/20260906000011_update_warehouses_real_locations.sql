-- Update Warehouse 1: Udupi FlashGO Store
UPDATE public.warehouses
SET 
  name = 'Udupi FlashGO Store',
  code = 'FG-UDP-001',
  address = 'Near Udupi Service Bus Stand, Udupi, Karnataka 576101',
  lat = 13.3427,
  lng = 74.74721,
  is_active = true,
  service_radius_km = 5
WHERE id = '9f4d3149-f3e4-432b-98b6-f17af77c9c33';

-- Update Warehouse 2: Manipal FlashGO Store
UPDATE public.warehouses
SET 
  name = 'Manipal FlashGO Store',
  code = 'FG-MPL-001',
  address = 'Near Manipal Bus Stand, Manipal, Karnataka',
  lat = 13.3516,
  lng = 74.78665,
  is_active = true,
  service_radius_km = 5
WHERE id = '76525a09-3fd1-4949-b45e-49c77255b4ce';
