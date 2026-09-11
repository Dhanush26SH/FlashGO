const fs = require('fs');
const content1 = fs.readFileSync('supabase/migrations/20260902000010_phase24_analytics_fixes.sql', 'utf8');
console.log(content1.match(/CREATE OR REPLACE FUNCTION public.get_sales_trends_custom[\s\S]*?\$\$;/)[0]);

const content2 = fs.readFileSync('supabase/migrations/20260828000001_secure_admin_analytics.sql', 'utf8');
console.log(content2.match(/CREATE OR REPLACE FUNCTION public.get_sales_trends[\s\S]*?\$\$;/)[0]);
