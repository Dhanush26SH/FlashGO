import fs from 'fs';
import path from 'path';

const content = fs.readFileSync('supabase/migrations/20260916000144_picker_weekly_settlements.sql', 'utf8');

// Extract the create_picker_settlement_batch function
const startTag = '-- Helper to safely compute and lock week period\nCREATE OR REPLACE FUNCTION public.create_picker_settlement_batch';
const endTag = 'END;\n$$;';
const startIndex = content.indexOf(startTag);
const endIndex = content.indexOf(endTag, startIndex) + endTag.length;

let rpcContent = content.substring(startIndex, endIndex);

// Make the modifications
rpcContent = rpcContent.replace(
    /IF EXTRACT\(ISODOW FROM p_week_start\) != 1 THEN\s+RAISE EXCEPTION 'week_start must be a Monday';\s+END IF;/g,
    `IF EXTRACT(ISODOW FROM p_week_start) != 3 THEN
        RAISE EXCEPTION 'week_start must be a Wednesday';
    END IF;`
);

// Add the grants
rpcContent += '\nREVOKE ALL ON FUNCTION public.create_picker_settlement_batch(UUID, DATE, UUID[]) FROM PUBLIC;';
rpcContent += '\nGRANT EXECUTE ON FUNCTION public.create_picker_settlement_batch(UUID, DATE, UUID[]) TO authenticated;\n';

const migrationContent = `-- Migration: 20260919142500_fix_picker_settlement_period.sql

${rpcContent}
`;

fs.writeFileSync('supabase/migrations/20260919142500_fix_picker_settlement_period.sql', migrationContent);
console.log('Migration generated.');
