import fs from 'fs';
import { execSync } from 'child_process';

const funcs = [
    'driver_book_gigs',
    'driver_shift_check_in',
    'driver_toggle_break_status',
    'driver_cod_settlement',
    'picker_shift_check_in',
    'picker_toggle_online',
    'start_picking',
    'warehouse_staff_shift_check_in',
    'warehouse_staff_toggle_online',
    'warehouse_staff_set_duty',
    'staff_start_return_intake',
    'admin_assign_picker',
    'admin_assign_active_shift_duty'
];

fs.writeFileSync('scratch/dump_rpc.sql', `
SELECT proname, pg_get_functiondef(oid) as def
FROM pg_proc
WHERE proname IN ('${funcs.join("','")}');
`);

console.log('Running query...');
try {
    const result = execSync('npx supabase db query -f scratch/dump_rpc.sql --linked').toString();
    fs.writeFileSync('scratch/rpc_dump.json', result);
    console.log('Saved to scratch/rpc_dump.json');
} catch (e) {
    console.error(e.message);
}
