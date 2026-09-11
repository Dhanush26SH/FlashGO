const fs = require('fs');

let file = 'supabase/migrations/20260902000006_final_notification_hooks.sql';
let text = fs.readFileSync(file, 'utf8');

// Fix the start_time and end_time references in staff_shifts trigger
text = text.replace(/OLD\.start_time IS DISTINCT FROM NEW\.start_time OR OLD\.end_time IS DISTINCT FROM NEW\.end_time/g, 'OLD.shift_start IS DISTINCT FROM NEW.shift_start OR OLD.shift_end IS DISTINCT FROM NEW.shift_end');

fs.writeFileSync(file, text);
console.log('Fixed staff_shifts column references in 00006.');
