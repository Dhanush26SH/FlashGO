const fs = require('fs');
let file = 'supabase/migrations/20260902000005_notification_hooks.sql';
let text = fs.readFileSync(file, 'utf8');

text = text.replace(/TEXT\)\\nRETURNS BOOLEAN/g, 'TEXT)\nRETURNS BOOLEAN');

fs.writeFileSync(file, text);
console.log('Fixed \\n syntax error.');
