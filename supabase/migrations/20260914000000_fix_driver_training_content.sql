-- 20260914000000_fix_driver_training_content.sql

-- 1. Fix "How Driver Assignments Work" to remove separate packer mention
UPDATE public.driver_training_modules
SET content = 'Driver assignments in FlashGO are fully automated through the backend system. 
- You must be approved and toggled ONLINE in the Driver App to receive assignments.
- The system assigns orders based on FEFO picking status, warehouse staff readiness, and driver proximity.
- Do NOT attempt to self-assign random customer orders. Wait for the assigned trip to appear in your Driver app dashboard.'
WHERE title = 'How Driver Assignments Work';

-- 2. Fix "Warehouse Handover Process" to explicitly mention Picker/Staff handover
UPDATE public.driver_training_modules
SET content = 'Warehouse Handover is a strict process to maintain inventory accuracy:
- The Picker or Warehouse Staff will complete the Pick and Pack process and wait for you.
- Do NOT take the order or leave the warehouse until the Picker or Staff explicitly performs the final HANDOVER confirmation on their device.
- Only after successful handover confirmation in the system will the trip become active for delivery on your app.'
WHERE title = 'Warehouse Handover Process';

-- 3. Fix "Failed / Cancelled Delivery Handling" just in case to align with Staff instead of just Manager
UPDATE public.driver_training_modules
SET content = 'Handling failed or cancelled deliveries correctly:
- If a customer is unavailable or cancels at the door, DO NOT mark the order as delivered.
- Use the app''s explicit failure/cancellation process.
- Return the exact package and inventory to the Warehouse Staff or Manager to preserve system correctness.'
WHERE title = 'Failed / Cancelled Delivery Handling';
