# F&V Daily Location ✓ Final Implementation Design

## 1. RLS and Table Schema
A standalone table exclusively for F&V inspections.

```sql
CREATE TABLE public.fnv_inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
    product_id UUID NOT NULL REFERENCES public.products(id),
    batch_id UUID NOT NULL REFERENCES public.product_batches(id),
    location_id UUID NOT NULL REFERENCES public.warehouse_locations(id),
    staff_id UUID NOT NULL REFERENCES public.profiles(id),
    inspection_date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date,
    result TEXT NOT NULL CHECK (result IN ('good', 'spoiled', 'damaged', 'quality_issue')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Daily Uniqueness Rule
    UNIQUE(batch_id, location_id, inspection_date)
);

-- RLS
ALTER TABLE public.fnv_inspections ENABLE ROW LEVEL SECURITY;

-- Authoritative warehouse identity derived directly from profiles
CREATE POLICY "Warehouse staff can view their warehouse fnv inspections" 
ON public.fnv_inspections FOR SELECT 
USING (warehouse_id = (SELECT warehouse_id FROM public.profiles WHERE id = auth.uid()));

-- Insert is strictly prohibited directly. Handled securely by SECURITY DEFINER RPCs.
```

## 2. Secure "Good / No Issue" RPC
A dedicated RPC `record_fnv_inspection_good` will be created to record successful "Good" inspections without mutating inventory.

**Security and Validations:**
- **Identity:** Identity is authoritatively derived using `auth.uid()`. It does not blindly trust a caller-supplied user ID.
- **Shift & Duty:** Validates the user has an active shift with the `fnv` duty.
- **Warehouse:** Validates the user's `warehouse_id`.
- **Batch Verification:** Validates `batch_id` exists and belongs to the correct warehouse.
- **Placement Verification:** Validates that `warehouse_product_placements` actually has a record for the `location_id` and `product_id` with `quantity > 0`.
- **Execution:** Performs an `INSERT INTO fnv_inspections ... ON CONFLICT DO NOTHING`.

## 3. Removal Integration
The existing `remove_fnv_batch_inventory` RPC remains structurally untouched. All inventory mutation, ledger writes, and locking behavior stays exactly the same.
At the very end of the RPC, inside the same successful transaction, we append:
```sql
INSERT INTO public.fnv_inspections 
    (warehouse_id, product_id, batch_id, location_id, staff_id, result) 
VALUES 
    (v_warehouse_id, v_batch.product_id, p_batch_id, p_location_id, p_user_id, p_reason)
ON CONFLICT (batch_id, location_id, inspection_date) DO NOTHING;
```

## 4. Frontend UI / UX (`FnvTaskWorkflow.tsx`)
1. **Fetch State:** `fetchFnvInventory()` queries `fnv_inspections` for today's date (`(new Date()).toISOString().split('T')[0]`) to build a set of completed `batch_id_location_id`.
2. **Task State:** Map `isCompletedToday` onto the task data.
3. **Action Prevention:** Modify the `taskCard`'s `onPress`: 
   `onPress={() => !t.isCompletedToday && startTask(t)}`
   This actively prevents the worker from accidentally re-starting an F&V inspection for an already-checked location today.
4. **Visual Tick:** If `isCompletedToday`, render a `<Check size={14} color="#10b981" /> Checked Today` badge inside the card. The card remains fully visible.
5. **Next Day Reset:** Since the query explicitly checks the current calendar day, when the clock crosses midnight (IST), the query yields nothing for the new day, and all cards naturally become actionable again.

## 5. Files to Modify
1. **Migration:** `supabase/migrations/<timestamp>_fnv_daily_inspections.sql` (Creates table, RLS, new `record_fnv_inspection_good` RPC, and updates `remove_fnv_batch_inventory`).
2. **Frontend Component:** `mobile-staff/src/screens/Warehouse/FnvTaskWorkflow.tsx` (Queries completions, renders tick, disables `onPress` for completed tasks, calls new "Good" RPC).

## 6. Safety Guarantee
This final design touches zero existing inventory flows. It adds an isolated, read-only layer (from the perspective of inventory) that only provides UI context. Historical data is completely ignored (no backfill needed). 
By making the "Checked Today" card unactionable, it prevents duplicate daily inspections, while the database-level uniqueness guarantees data consistency.
