# F&V Daily Location ✓ Design Report

## 1. Proposed Table Schema
We will create a small, isolated table dedicated exclusively to tracking F&V inspection completions.

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
```

## 2. RLS & Security Requirements
- **Enable RLS** on `fnv_inspections`.
- **SELECT Policy:** Warehouse Staff can select records where `warehouse_id = auth.jwt() -> user_metadata -> warehouse_id`.
- **INSERT Policy:** No direct insert. All inserts will happen via `SECURITY DEFINER` RPCs to enforce shift and duty validation.

## 3. Daily Uniqueness Rule & Timezone Handling
The combination of `(batch_id, location_id, inspection_date)` must be `UNIQUE`. 
**Timezone Handling:** To ensure "today" aligns with Indian Standard Time (IST, the business timezone) regardless of server UTC time, `inspection_date` is strictly cast using `AT TIME ZONE 'Asia/Kolkata'`. This prevents late-night edge cases where UTC rolls over before the physical warehouse day ends.

## 4. Exact "Good / No Issue" Completion Path
Currently, "Good" does nothing. We will create a new, minimal RPC specifically for this:
- **New RPC:** `record_fnv_inspection_good(p_location_id, p_batch_id, p_user_id)`
- **Logic:** Performs the standard active-shift and F&V duty validation. Then executes exactly one query:
  `INSERT INTO public.fnv_inspections (warehouse_id, product_id, batch_id, location_id, staff_id, result) VALUES (...)`
- **Inventory Impact:** Absolutely none. No inventory tables are touched.

## 5. Exact Removal Completion Path
We will append one atomic statement to the very end of the existing, working `remove_fnv_batch_inventory` RPC.
- **Logic:** Immediately after the `stock_ledgers` insertion, add:
  ```sql
  INSERT INTO public.fnv_inspections 
    (warehouse_id, product_id, batch_id, location_id, staff_id, result) 
  VALUES 
    (v_warehouse_id, v_batch.product_id, p_batch_id, p_location_id, p_user_id, p_reason)
  ON CONFLICT (batch_id, location_id, inspection_date) DO NOTHING;
  ```
- **ON CONFLICT DO NOTHING:** If the staff member performs two removals for the same batch at the same location on the same day, the second removal will still succeed (inventory is removed, ledger is created), but we simply don't record a duplicate inspection row.

## 6. Exact Frontend Read & Display Changes
In `FnvTaskWorkflow.tsx`:
1. **Read:** In `fetchFnvInventory()`, after fetching batches, query `fnv_inspections` for the current warehouse where `inspection_date = today (in IST)`. 
2. **Transform:** Map these completions into a local set: `completedSet.add(batch_id + '_' + location_id)`.
3. **Task Mapping:** When building `enrichedTasks`, add a boolean flag: `isCompletedToday: completedSet.has(batch_id + '_' + location_id)`.
4. **Display:** Inside the `taskCard` render function, conditionally render `<Check size={16} color="#10b981" />` next to the location code if `isCompletedToday` is true. The card remains fully clickable.
5. **Action:** Update `submitRemoval` to call the new `record_fnv_inspection_good` RPC when `issueReason === 'good'`.

## 7. Files and Migrations Requiring Modification
1. **New Migration:** `..._fnv_daily_inspections.sql` containing:
   - `CREATE TABLE fnv_inspections`
   - RLS Policies
   - `CREATE FUNCTION record_fnv_inspection_good`
   - `CREATE OR REPLACE FUNCTION remove_fnv_batch_inventory` (to append the single INSERT)
2. **Frontend Component:** `mobile-staff/src/screens/Warehouse/FnvTaskWorkflow.tsx` (to fetch the completed list and render the ✓).

## 8. Why This Cannot Affect Existing Inventory Flows
This design is architecturally isolated:
1. **No Dependencies:** The `fnv_inspections` table stands alone. Nothing joins to it for inventory calculations, and there are no triggers attached to it.
2. **No Alterations to Logic:** The `remove_fnv_batch_inventory` RPC preserves all existing placement locking, batch validations, and ledger updates. The new `INSERT` is added strictly at the end. If the removal fails early (e.g., insufficient stock), the implicit transaction rolls back, meaning we never falsely record a completion.
3. **No Good Path Contamination:** The "Good" outcome uses a completely separate, dedicated RPC that only touches the new standalone table, guaranteeing zero risk to actual inventory quantities.
