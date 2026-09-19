import fs from 'fs';

// Read the old RPC from the original file
const originalFile = fs.readFileSync('supabase/migrations/20260916150500_staff_settlements_and_fixes.sql', 'utf8');

// Find the start and end of create_driver_settlement_batch
const startIndex = originalFile.indexOf('CREATE OR REPLACE FUNCTION public.create_driver_settlement_batch(');
const endIndex = originalFile.indexOf('$$;', startIndex) + 3;

let originalRpc = originalFile.substring(startIndex, endIndex);

// We need to inject the chronological guard before the IF EXISTS check
const guardInjectionPoint = '            IF EXISTS (SELECT 1 FROM public.driver_settlements WHERE driver_id = v_driver_id AND warehouse_id = p_warehouse_id AND week_start = p_week_start) THEN';

const chronologicalGuard = `            -- Enforce strict chronological continuity
            IF EXISTS (
                SELECT 1 FROM public.driver_financial_ledger dfl
                WHERE dfl.driver_id = v_driver_id
                  AND dfl.occurred_at < v_week_start_tz
                  AND NOT EXISTS (
                      SELECT 1 FROM public.driver_settlement_items dsi
                      WHERE dsi.ledger_id = dfl.id
                  )
            ) THEN
                RAISE EXCEPTION 'Chronological error: Driver % has unsettled ledger activity in a previous week. Older settlements must be generated first.', v_driver_id;
            END IF;

`;

// Add new variables to DECLARE block
const declareInjectionPoint = '    v_net NUMERIC(10,2);';
const newVars = `    v_net_before_carry NUMERIC(10,2);
    v_previous_remaining NUMERIC(10,2);
    v_carried_deficit NUMERIC(10,2);
    v_deficit_recovered NUMERIC(10,2);
    v_remaining_deficit NUMERIC(10,2);`;

// Replace the ID NOT IN query inside the FOR loop to use NOT EXISTS
let newRpc = originalRpc.replace(
    'AND id NOT IN (SELECT ledger_id FROM public.driver_settlement_items)',
    `AND NOT EXISTS (
                      SELECT 1 FROM public.driver_settlement_items dsi
                      WHERE dsi.ledger_id = public.driver_financial_ledger.id
                  )`
);

// We also need to get v_previous_remaining and calculate the carry logic.
// The calculation block is:
//             IF v_ledger_count > 0 THEN
//                 v_gross := v_delivery + v_tips + v_inc;
//                 v_ded := v_pen;
//                 v_net := v_gross - v_ded + v_adj;
//                 
//                 UPDATE public.driver_settlements 
//                 SET delivery_earnings = v_delivery, customer_tips = v_tips, incentives = v_inc,
//                     gross_amount = v_gross, penalties = v_pen, deductions = v_ded,
//                     adjustments = v_adj, net_amount = v_net
//                 WHERE id = v_settlement_id;

const originalCalcBlock = `            IF v_ledger_count > 0 THEN
                v_gross := v_delivery + v_tips + v_inc;
                v_ded := v_pen;
                v_net := v_gross - v_ded + v_adj;

                UPDATE public.driver_settlements 
                SET delivery_earnings = v_delivery, customer_tips = v_tips, incentives = v_inc,
                    gross_amount = v_gross, penalties = v_pen, deductions = v_ded,
                    adjustments = v_adj, net_amount = v_net
                WHERE id = v_settlement_id;`;

const newCalcBlock = `            IF v_ledger_count > 0 THEN
                v_gross := v_delivery + v_tips + v_inc;
                v_ded := v_pen;

                -- 1. Get previous remaining_deficit
                SELECT remaining_deficit INTO v_previous_remaining
                FROM public.driver_settlements
                WHERE driver_id = v_driver_id 
                  AND week_start < p_week_start
                ORDER BY week_start DESC 
                LIMIT 1;

                IF v_previous_remaining IS NULL THEN
                    v_previous_remaining := 0;
                END IF;

                -- 2. Net before carry
                v_carried_deficit := v_previous_remaining;
                v_net_before_carry := v_gross - v_ded + v_adj;

                -- 3. Recovery logic
                IF v_net_before_carry > 0 THEN
                    v_deficit_recovered := LEAST(v_carried_deficit, v_net_before_carry);
                    v_net := v_net_before_carry - v_deficit_recovered;
                    v_remaining_deficit := v_carried_deficit - v_deficit_recovered;
                ELSE
                    v_deficit_recovered := 0;
                    v_net := v_net_before_carry;
                    v_remaining_deficit := v_carried_deficit + ABS(v_net_before_carry);
                END IF;

                UPDATE public.driver_settlements 
                SET delivery_earnings = v_delivery, customer_tips = v_tips, incentives = v_inc,
                    gross_amount = v_gross, penalties = v_pen, deductions = v_ded,
                    adjustments = v_adj, net_amount = v_net,
                    carried_deficit = v_carried_deficit,
                    deficit_recovered = v_deficit_recovered,
                    remaining_deficit = v_remaining_deficit
                WHERE id = v_settlement_id;`;

newRpc = newRpc.replace(originalCalcBlock, newCalcBlock);
newRpc = newRpc.replace(guardInjectionPoint, chronologicalGuard + guardInjectionPoint);
newRpc = newRpc.replace(declareInjectionPoint, declareInjectionPoint + '\n' + newVars);

const migrationContent = `-- Migration: 20260919145000_driver_deficit_carry_forward.sql

-- 1. Add schema columns
ALTER TABLE public.driver_settlements 
ADD COLUMN IF NOT EXISTS carried_deficit NUMERIC(10,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS deficit_recovered NUMERIC(10,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS remaining_deficit NUMERIC(10,2) NOT NULL DEFAULT 0;

-- 2. Replace RPC with hardened V2 implementation
${newRpc}
REVOKE ALL ON FUNCTION public.create_driver_settlement_batch(UUID, DATE, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_driver_settlement_batch(UUID, DATE, UUID[]) TO authenticated;

-- 3. Deterministic Backfill of Historical Deficits
DO $$
DECLARE
    v_driver_id UUID;
    v_settlement RECORD;
    v_previous_remaining NUMERIC(10,2);
    v_carried_deficit NUMERIC(10,2);
    v_deficit_recovered NUMERIC(10,2);
    v_remaining_deficit NUMERIC(10,2);
    v_net_before_carry NUMERIC(10,2);
BEGIN
    FOR v_driver_id IN (SELECT DISTINCT driver_id FROM public.driver_settlements) LOOP
        v_previous_remaining := 0;
        
        FOR v_settlement IN 
            SELECT id, gross_amount, deductions, adjustments, net_amount 
            FROM public.driver_settlements 
            WHERE driver_id = v_driver_id 
            ORDER BY week_start ASC
        LOOP
            v_carried_deficit := v_previous_remaining;
            v_net_before_carry := v_settlement.gross_amount - v_settlement.deductions + v_settlement.adjustments;
            
            IF v_net_before_carry > 0 THEN
                v_deficit_recovered := LEAST(v_carried_deficit, v_net_before_carry);
                v_remaining_deficit := v_carried_deficit - v_deficit_recovered;
            ELSE
                v_deficit_recovered := 0;
                v_remaining_deficit := v_carried_deficit + ABS(v_net_before_carry);
            END IF;
            
            -- We don't change net_amount or status for historical settlements.
            -- This strictly updates the deficit chain tracking columns so future settlements can resume.
            UPDATE public.driver_settlements
            SET carried_deficit = v_carried_deficit,
                deficit_recovered = v_deficit_recovered,
                remaining_deficit = v_remaining_deficit
            WHERE id = v_settlement.id;
            
            v_previous_remaining := v_remaining_deficit;
        END LOOP;
    END LOOP;
END $$;
`;

fs.writeFileSync('supabase/migrations/20260919145000_driver_deficit_carry_forward.sql', migrationContent);
console.log('Migration script generated.');
