const fs = require('fs');

let file = 'supabase/migrations/20260902000009_phase24_analytics.sql';
let text = fs.readFileSync(file, 'utf8');

// 1. Fix AS $BODY$ syntax errors
text = text.replace(/AS \r?\nDECLARE/g, 'AS $BODY$\nDECLARE');
text = text.replace(/END;\r?\n;/g, 'END;\n$BODY$;');

// 2. Add date validation to all functions
let dateValidation = `  v_start := p_start_date::timestamp with time zone;
  v_end := p_end_date::timestamp with time zone;
  IF v_start > v_end THEN
    RAISE EXCEPTION 'Invalid date range';
  END IF;`;
text = text.replace(/  v_start := p_start_date::timestamp with time zone;\r?\n  v_end := p_end_date::timestamp with time zone;/g, dateValidation);

// 3. Fix financial ledger export to prevent double counting
text = text.replace(/AND \(p_warehouse_id IS NULL OR o\.warehouse_id = p_warehouse_id\)/g, "AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id)\n      AND pt.status = 'paid'");

fs.writeFileSync(file, text);
console.log('Fixed 00009 syntax, added date validation, and added financial integrity check.');
