const fs = require('fs');
let file = 'supabase/migrations/20260902000005_notification_hooks.sql';
let text = fs.readFileSync(file, 'utf8');

// Replace malformed "AS $" and "$;" with proper $BODY$ delimiters
text = text.replace(/AS \$\r?\n/g, 'AS $BODY$\n');
text = text.replace(/END;\r?\n\$;/g, 'END;\n$BODY$;');

// Fix malformed PL/pgSQL: missing semicolon after END IF in process_checkout
text = text.replace(/END IF\r?\n\s+UPDATE public\.profiles SET wallet_balance/g, 'END IF;\n        \n        UPDATE public.profiles SET wallet_balance');

fs.writeFileSync(file, text);
console.log('Fixed 00005 dollar quotes and PL/pgSQL syntax errors.');
