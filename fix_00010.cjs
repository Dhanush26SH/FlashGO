const fs = require('fs');

let file = 'supabase/migrations/20260902000010_phase24_analytics_fixes.sql';
let text = fs.readFileSync(file, 'utf8');

// 1. Fix AS $BODY$ syntax errors
text = text.replace(/AS \r?\nDECLARE/g, 'AS $BODY$\nDECLARE');
text = text.replace(/END;\r?\n;/g, 'END;\n$BODY$;');

// 2. Fix pt.status IN ('captured', 'collected') to pt.status = 'paid'
text = text.replace(/pt\.status IN \('captured', 'collected'\)/g, "pt.status = 'paid'");

// 3. Add financial double-counting prevention (AND pt.status = 'paid') to get_financial_ledger_export
text = text.replace(/AND \(p_warehouse_id IS NULL OR o\.warehouse_id = p_warehouse_id\)\r?\n    ORDER BY pt\.created_at DESC/g, "AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id)\n      AND pt.status = 'paid'\n    ORDER BY pt.created_at DESC");

fs.writeFileSync(file, text);
console.log('Fixed 00010 syntax and financial reporting semantics.');
