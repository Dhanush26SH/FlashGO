const fs = require('fs');
let file = 'supabase/migrations/20260902000005_notification_hooks.sql';
let text = fs.readFileSync(file, 'utf8');

text = text.replace(/IF v_old_status = p_status THEN RETURN; END IF;/g, 'IF v_old_status = p_status THEN RETURN FALSE; END IF;');

fs.writeFileSync(file, text);
console.log('Fixed missing return value.');
