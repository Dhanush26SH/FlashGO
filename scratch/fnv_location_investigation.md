# F&V Work History Location Investigation Report

## 1. Component, Service, and Query
- **Frontend Component:** `src/views/Admin/modules/WorkforceActivity.tsx`
- **Authoritative RPC:** `admin_get_warehouse_staff_work_history`

## 2. Authoritative Source of F&V Records
The authoritative source for completed F&V removals is the **`stock_ledgers`** table where `reference_type = 'fnv_workflow'` and `reason IN ('spoiled', 'damaged', 'quality_issue')`.

## 3. Current Storage of Location Data
Currently, **no location data is stored**. Completed F&V removals do not save `location_id`, `placement_id`, or a `location_code`. 

## 4. `remove_fnv_batch_inventory` RPC Behavior
The RPC accepts `p_location_id` as an input parameter and uses it to validate the product's physical placement and decrement `warehouse_product_placements.quantity`. However, it **does not persist** `p_location_id` anywhere after the validation and decrement are complete.

## 5. `stock_ledgers` Fields for F&V
A successful Damaged / Bruised removal inserts a record into `stock_ledgers` with only the following fields populated:
- `warehouse_id`
- `product_id`
- `batch_id`
- `quantity_change` (negative removed amount)
- `reason` (e.g., `'damaged'`)
- `performed_by` (Staff User ID)
- `reference_type` (`'fnv_workflow'`)

There is no `location_id` or JSON metadata field available in this table.

## 6. Can Location be Obtained via Joins Read-Only?
**No.** A product or batch can exist in multiple physical locations simultaneously, and placements are frequently deleted/updated. Since the `stock_ledgers` table only records the `batch_id` and `product_id`, it is impossible to retroactively determine exactly *which* specific placement/location the staff member scanned at the time of the task.

## 7. Confirmation of Non-Persistence
The location is strictly **not currently persisted** at task completion. 

## 8. Smallest Safe Solution
**Option B: Forward-only persistence for future F&V completions.**
Because the authoritative location is not currently persisted, the minimal proposed change would be:
1. **Migration:** Add a `location_id UUID REFERENCES warehouse_locations(id)` column (or a `metadata JSONB` column) to the `stock_ledgers` table.
2. **RPC Update:** Modify `remove_fnv_batch_inventory` to insert `p_location_id` into the new column in `stock_ledgers`.
3. **RPC Update:** Modify `admin_get_warehouse_staff_work_history` to join `warehouse_locations` on `sl.location_id` and extract the `location_code` into the `details` JSON payload.
4. **Frontend Update:** Update `WorkforceActivity.tsx` to display the returned location if present.

## 9. Impact on Historical Records
If this is implemented, all historical F&V records prior to the change will permanently lack location data (as it was never recorded). They must safely default to displaying "N/A" or "Unknown Location" in the UI. We cannot and should not attempt to backfill or guess these historical locations.
