-- Payouts
SELECT id, earning_date, total_amount, settlement_id 
FROM public.staff_shift_payouts
WHERE staff_id = '180847a2-f6f5-48d6-bcbc-def7629b322e'
ORDER BY earning_date;

-- Settlements
SELECT id, period_start, period_end, total_amount, status
FROM public.picker_settlements
WHERE staff_id = '180847a2-f6f5-48d6-bcbc-def7629b322e'
ORDER BY period_start;
