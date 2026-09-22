SELECT json_build_object(
  'payouts', (
    SELECT json_agg(row_to_json(p)) 
    FROM (
      SELECT * 
      FROM public.staff_shift_payouts
      WHERE staff_id = '180847a2-f6f5-48d6-bcbc-def7629b322e'
      ORDER BY earning_date
    ) p
  ),
  'settlements', (
    SELECT json_agg(row_to_json(s)) 
    FROM (
      SELECT *
      FROM public.picker_settlements
      WHERE staff_id = '180847a2-f6f5-48d6-bcbc-def7629b322e'
    ) s
  )
) as result;
