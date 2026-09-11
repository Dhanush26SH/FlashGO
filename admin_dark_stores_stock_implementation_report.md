# Admin Dark Stores & Stock Implementation & Runtime Verification Report

## 1. Implementation Summary

The Dark Stores & Stock Page 5 has been completely refactored to rely exclusively on the authoritative backend. All mock prototypes have been removed, and the UI now reflects real physical operations.

### Schema & RPC Alignment
- Inspected `product_batches` to confirm it uses `available_quantity`, not `quantity_remaining`.
- Discovered and fixed a production bug in `get_dashboard_inventory_alerts` where it was referencing the nonexistent `quantity_remaining` column, aligning its low-stock logic to globally aggregate `get_sellable_quantity() < 20`.
- Created three new Admin-specific `SECURITY DEFINER` RPCs (`admin_get_warehouse_inventory`, `admin_get_stock_ledgers`, `admin_get_product_batches`).
- The sellable stock calculation inside `admin_get_warehouse_inventory` is verified to explicitly execute `get_sellable_quantity(warehouse_id, product_id)`, guaranteeing zero divergence from Picker/Customer apps.
- Damaged and Expired stock metrics are derived directly from the immutable `stock_ledgers` table by summing adjustments with `reason IN ('damaged', 'expired')`.

### Prototypes Removed (As Requested)
- **Stock Transfer**: Cleanly removed. (Option B chosen as no transit subsystem exists).
- **Smart Stock Predictor**: Removed client-side math UI.
- **Procurement Pipeline**: Removed from Page 5 (belongs in B2B).
- **Global Stock Display**: All references to `products.stock_quantity` purged from this page.

### Admin Mutations
- The read-only constraint was strictly maintained. The mock `inwardStockBatch` flow was completely removed from the frontend and backend API service, ensuring no fake operational inventory workflows remain in the Admin UI. Warehouse Staff remains the sole authoritative workflow for physical receiving.

## 2. Runtime Verification Results

The implementation was strictly verified against the live operational DB.

| Test | Status | Notes |
| :--- | :--- | :--- |
| **Inventory truth** | PASS ✅ | `admin_get_warehouse_inventory` matches `warehouse_stock` physical numbers. Sellable explicitly equals `get_sellable_quantity`. Low-stock logic aligns perfectly with Page 1's `< 20` threshold. |
| **Reservation lifecycle** | PASS ✅ | Creating a checkout reservation increases `reserved_quantity` and decreases `sellable_quantity`. Cancelling the order releases it, proving the reservations table drives the sellable output. |
| **Picker lifecycle** | PASS ✅ | (Verified in previous session) Picker FEFO consumption decrements batch stock, reflects in ledger, and alters physical counts in real-time. |
| **Warehouse adjustment** | PASS ✅ | Adjusting batch stock logs to `stock_ledgers`. The new Admin Batch UI correctly aggregates this as `damaged_quantity` or `expired_quantity` based on the ledger reason. |
| **Negative/reservation protection** | PASS ✅ | `adjust_batch_stock` explicitly blocks negative inventory and protects reserved stock natively. |
| **Batch** | PASS ✅ | UI reflects `available_quantity`. Expiry correctly calculates `days_left`. FEFO data matches the authoritative table. |
| **Realtime** | PASS ✅ | Supabase channels configured for `warehouse_stock`, `inventory_reservations`, `stock_ledgers`, and `product_batches` using strict `warehouse_id=eq.X` filters. Data refreshes instantly upon external operational mutations. |
| **Security** | PASS ✅ | `admin_` RPCs enforce strict `role = 'admin'`. Frontend UI has zero raw mutation inputs. Direct REST mutation is blocked by RLS. |
| **Regression** | PASS ✅ | `tsc --noEmit` and `npm run build` completed with zero errors. Customer catalog and Picker flows remain unbroken. |

## 3. Conclusion

**ADMIN PAGE 5 — DARK STORES & STOCK APPROVED & FROZEN ✅**
