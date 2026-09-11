# Admin Dark Stores & Stock Core Audit Report

## 1. Authoritative Inventory Architecture

I have traced the database schema and migrations to identify the single source of truth for FlashGO's inventory.

*   **Physical Stock:** Tracked securely per-warehouse in `public.warehouse_stock(quantity)`.
*   **Reserved Stock:** Tracked dynamically in `public.inventory_reservations` (sum of `quantity` where `status = 'reserved'`).
*   **Sellable Stock:** Calculated dynamically via the `get_sellable_quantity(warehouse_id, product_id)` RPC, which accurately executes `GREATEST(0, physical - reserved)`.
*   **Product Batches (FEFO):** Tracked in `public.product_batches` (`available_quantity`, `expiry_date`, `status`).
*   **Stock Ledger (History):** Tracked immutably in `public.stock_ledgers` (logs `grn`, `picking`, `damage`, `expiry`, `cycle_count`, etc. with exact `quantity_change`).
*   **Global Stock Cache (`products.stock_quantity`):** This is a *derived aggregate cache* updated via database triggers (`sync_global_product_stock`) meant for global metrics. **It must NOT be used for warehouse-specific inventory decisions.**

## 2. Current Feature Inventory (`InventoryWarehouse.tsx`)

| Feature | Status | Analysis |
| :--- | :--- | :--- |
| **Warehouse Selector** | **MISSING** | Hardcodes to the first warehouse in the DB. No UI dropdown exists to switch warehouses. |
| **Current Stock** | **BROKEN** | UI binds to `products.stock_quantity` (global stock), completely ignoring the warehouse-specific `warehouse_stock` table. |
| **Sellable / Reserved Stock** | **MISSING** | Neither reserved stock nor true sellable stock is displayed anywhere. |
| **Low Stock Alerts** | **BROKEN** | Uses global `< 20` logic via an insecure `get_inventory_analytics` RPC instead of real warehouse sellable stock. |
| **Out of Stock Tracker** | **MISSING** | No dedicated OOS tracking or alerting. |
| **Batch Visibility & Expiry** | **BROKEN** | UI expects mock property names (`batchCode`, `qty`, `daysLeft`) which completely mismatch the real DB columns (`batch_number`, `quantity_remaining`, etc.). |
| **Damaged / Expired Stock** | **MISSING** | No UI to view or manage damaged/expired inventory. |
| **Stock Adjustments** | **MISSING** | No interface exists for Admin to perform stock discrepancy adjustments. |
| **Stock Movement / Ledger** | **MISSING** | The "Current Stock & History" tab displays a static product list with no ledger history whatsoever. |
| **Inward / Receiving** | **PARTIAL** | The UI form triggers a real backend RPC (`inward_stock_batch`), but is labeled as a "Mock Setup" and lacks proper UI feedback/validation. |
| **Stock Transfer** | **MISSING** | Tab exists, but zero frontend or backend implementation. |
| **Warehouse Capacity** | **FAKE** | Hardcoded capacity numbers on the map UI. The DB schema does not track volume capacity. |
| **Search / Filter** | **MISSING** | No ability to search SKUs or filter the inventory list. |
| **Smart Predictor / POs** | **FAKE** | Runs client-side math with hardcoded sales velocity. Procurement PO generation is a pure frontend context mock. |

## 3. Admin vs Warehouse Staff Responsibility

The frozen Warehouse Staff App is built to handle the physical reality of the dark store (scanning barcodes, receiving shipments, cycle counting). 

*   **Warehouse Staff (Physical):** Inward/Receiving (GRN), Picking (Consuming stock), Cycle Counting (Adjustments), Damage Reporting.
*   **Admin (Supervisory):** 
    *   **VIEW:** Live physical, reserved, and sellable stock levels; Immutable stock ledgers; Batch expiry warnings.
    *   **MUTATE:** Emergency inventory overrides (using the same secure `adjust_batch_stock` RPC); Managing warehouse metadata (Name, Coordinates, Active state).

Admin should NOT duplicate daily Warehouse Staff workflows, nor invent new fake metrics.

## 4. Batch / FEFO Consistency

**Findings:** The backend correctly implements FEFO (First-Expire-First-Out) via `product_batches` and secures consumption during checkout and picking. However, the Admin Page 5 UI fails to reflect this reality, binding instead to incorrect or mock data properties. Admin numbers currently do not agree with Customer sellability.

## 5. Low Stock / Out of Stock

**Findings:** Current low stock alerts are calculated globally via `products.stock_quantity < 20`. This is fundamentally broken for a multi-dark-store model. Low stock alerts *must* be derived from `get_sellable_quantity(warehouse_id, product_id)`.

## 6. Stock Movement / Ledger

**Findings:** The `stock_ledgers` table securely and correctly tracks all movements. However, Admin has **zero visibility** into this table. There is no UI to view the history.

## 7. Stock Transfer

**Findings:** Stock Transfer is completely **MISSING**. No secure backend RPC exists to decrement from Warehouse A and increment Warehouse B while handling transit states. 
*Recommendation:* Classify as OPTIONAL/FUTURE. Inventing a safe multi-warehouse transit system is out of scope for the core Q-commerce completion deadline.

## 8. Warehouse Management

**Findings:** The Admin UI has a "Manage Warehouses" tab that allows toggling the `active` state. However, it lacks the ability to edit coordinates or capacity safely. Warehouse coordinates are heavily relied upon by Customer routing (Phase 13/15) and Live Delivery Map. Editing them without care can break routing.

## 9. Security

**Findings:** The underlying architecture (e.g., `inward_stock_batch`, `adjust_batch_stock`) is secure and utilizes `SECURITY DEFINER` RPCs with strict role checks (`role IN ('admin', 'warehouse_staff')`). However, `get_inventory_analytics` leaks global stock and is not warehouse-scoped. 

## 10. Realtime

**Findings:** The UI subscribes to `orders`, `products`, and `product_batches` using Supabase Realtime, but it **completely misses** the `warehouse_stock` and `inventory_reservations` tables, which are the actual tables driving live stock levels.

## 11. Prototypes to Remove

*   **REMOVE:** "Smart Stock Predictor" (Fake client-side math).
*   **REMOVE:** "Procurement Pipeline" (Fake context-based PO system).
*   **REMOVE:** "Warehouse Capacity" mock stats from the map.
*   **REMOVE:** "Stock Transfer" tab (unimplemented).

---

## 12. Minimal Implementation Plan (To make Page 5 Core-Complete)

To hit the project deadline, we must strip away the enterprise bloat and wire Page 5 exclusively to the authoritative backend.

### MUST FIX (Core Implementation)
1.  **Backend RPC (`admin_get_warehouse_inventory`):** Create a secure RPC that returns the exact inventory for a specific `p_warehouse_id`, joining `warehouse_stock`, `inventory_reservations`, and `get_sellable_quantity`.
2.  **Backend RPC (`admin_get_stock_ledger`):** Create a secure RPC to fetch the `stock_ledgers` history for a specific warehouse.
3.  **UI Rewrite (`InventoryWarehouse.tsx`):**
    *   Delete the Smart Predictor, PO pipeline, and Stock Transfer tabs.
    *   Implement a real **Warehouse Selector** dropdown.
    *   Update the **Current Stock** table to show: Physical, Reserved, and True Sellable stock based on the new RPC.
    *   Update the **Stock Ledger** tab to display the immutable movement history.
    *   Fix the **Near-Expiry / Batch Monitor** to map correctly to `product_batches`.
    *   Correct the **Low Stock Alerts** to use warehouse-aware sellable quantities.
4.  **Realtime Subscriptions:** Update Supabase channels to listen to `warehouse_stock` and `inventory_reservations`.

### SHOULD HAVE (If Time Permits)
*   Emergency Stock Adjustment UI (wiring into the existing secure `adjust_batch_stock` RPC).

### OPTIONAL / FUTURE
*   Inter-warehouse Stock Transfers.
*   Automated Procurement / Supplier integration.
*   Predictive AI Demand Forecasting.
