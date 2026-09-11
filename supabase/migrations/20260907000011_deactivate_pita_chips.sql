-- Migration to deactivate duplicate Baked Pita Chips

UPDATE products SET is_active = false WHERE id = 'f3c1cc57-a2d1-499e-80c8-705c5fc12fe3';
UPDATE products SET is_active = false WHERE id = 'd44fb868-19f8-4483-8303-792c294e1af3';
UPDATE products SET is_active = false WHERE id = '4606659b-f0b2-40b7-a00e-42629c6fcf46';
UPDATE products SET is_active = false WHERE id = '819ba37e-29c8-4501-a3f2-ccb60aec3778';
UPDATE products SET is_active = false WHERE id = 'a23bf886-c599-4859-b653-05f953a8e0fc';
UPDATE products SET is_active = false WHERE id = 'ba0c1013-dc53-44c5-a4fc-ffe5cdd426ac';
