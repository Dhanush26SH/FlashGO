const fs = require('fs');

let file = 'supabase/migrations/20260902000007_phase23_promotions.sql';
let text = fs.readFileSync(file, 'utf8');

// Fix AS $ and $; syntax errors
text = text.replace(/AS \$\r?\n/g, 'AS $BODY$\n');
text = text.replace(/END;\r?\n\$;/g, 'END;\n$BODY$;');

// Make CREATE POLICY statements idempotent due to partial application
text = text.replace(/CREATE POLICY "Customers and staff read active promotions"/g, 'DROP POLICY IF EXISTS "Customers and staff read active promotions" ON public.promotions;\nCREATE POLICY "Customers and staff read active promotions"');
text = text.replace(/CREATE POLICY "Admins full access to promotions"/g, 'DROP POLICY IF EXISTS "Admins full access to promotions" ON public.promotions;\nCREATE POLICY "Admins full access to promotions"');

fs.writeFileSync(file, text);
console.log('Fixed 00007 syntax and made policies idempotent.');
