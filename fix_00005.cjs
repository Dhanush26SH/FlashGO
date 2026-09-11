const fs = require('fs');
let file = 'supabase/migrations/20260902000005_notification_hooks.sql';
let text = fs.readFileSync(file, 'utf8');

// Replace malformed "AS $" and "$;" with proper $BODY$ delimiters
text = text.replace(/AS \$\r?\n/g, 'AS $BODY$\n');
text = text.replace(/END;\r?\n\$;/g, 'END;\n$BODY$;');

fs.writeFileSync(file, text);
console.log('Fixed 00005 dollar quotes.');
