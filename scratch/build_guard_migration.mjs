import fs from 'fs';

// Read the old RPC from the previously generated migration
const originalFile = fs.readFileSync('supabase/migrations/20260919145000_driver_deficit_carry_forward.sql', 'utf8');

const startIndex = originalFile.indexOf('CREATE OR REPLACE FUNCTION public.create_driver_settlement_batch(');
const endIndex = originalFile.indexOf('$$;', startIndex) + 3;

let originalRpc = originalFile.substring(startIndex, endIndex);

const injectionPoint = '    v_week_end_tz := v_week_start_tz + INTERVAL \'7 days\';';

const guardLogic = `
    -- Enforce period close: Do not allow generation if the period is still active
    IF now() < v_week_end_tz THEN
        RAISE EXCEPTION 'Cannot generate settlement: The accounting period is still active. Generation will be available on %', v_week_end_tz;
    END IF;
`;

let newRpc = originalRpc.replace(injectionPoint, injectionPoint + guardLogic);

const migrationContent = `-- Migration: 20260919152300_driver_settlement_period_guard.sql

-- Patch create_driver_settlement_batch to enforce period-close protection
${newRpc}
REVOKE ALL ON FUNCTION public.create_driver_settlement_batch(UUID, DATE, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_driver_settlement_batch(UUID, DATE, UUID[]) TO authenticated;
`;

fs.writeFileSync('supabase/migrations/20260919152300_driver_settlement_period_guard.sql', migrationContent);
console.log('Migration script generated.');
