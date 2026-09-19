
SELECT proname, pg_get_functiondef(oid) as def
FROM pg_proc
WHERE proname IN ('driver_book_gigs','driver_shift_check_in','driver_toggle_break_status','driver_cod_settlement','picker_shift_check_in','picker_toggle_online','start_picking','warehouse_staff_shift_check_in','warehouse_staff_toggle_online','warehouse_staff_set_duty','staff_start_return_intake','admin_assign_picker','admin_assign_active_shift_duty');
