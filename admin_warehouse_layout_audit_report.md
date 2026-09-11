# Admin Warehouse Layout Core Audit Report

## 1. Page Architecture & Location Schema
- **Page Component:** `src/views/Admin/modules/WarehouseLayout.tsx`
- **Location Model:** FlashGO does **not** possess a hierarchical location schema (`aisles`, `racks`, `shelves`, `warehouse_locations`). The only representation of physical location is a single `TEXT` column named `warehouse_location` on the global `products` table (e.g., `'F0-A01-001'`).
- **Warehouse Scoping:** **BROKEN/NON-EXISTENT**. Because `warehouse_location` is attached directly to the global `products` table rather than a warehouse-specific mapping table (like `warehouse_stock`), a product can only have ONE physical location across all FlashGO Dark Stores. This fundamentally violates multi-warehouse operations.

## 2. Integration & Boundaries
- **Picker Integration:** The Picker App genuinely reads `item.product.warehouse_location` to display the bin and sort the pick path. The string field itself is operationally active.
- **Warehouse Staff Integration:** None. Warehouse staff operations (inwarding, batch adjustments) rely on `product_batches` and `dark_stores`, not physical layout coordinates.
- **Inventory Boundary:** Physical inventory quantities remain securely owned by Page 5 and the `warehouse_inventory_rpcs`. Page 10 does not touch `stock_quantity`.

## 3. UI Real-vs-Mock Matrix

| Feature / UI Element | Classification | Source |
| :--- | :--- | :--- |
| `ZONES` Definition (Aisles, Racks) | **HARDCODED** | React constant array in `WarehouseLayout.tsx` |
| Floor Map Visualization | **MOCK** | CSS grid generated from hardcoded zones |
| Capacity / Utilization % | **MOCK** | Fake math assuming 100 max capacity per prefix |
| Selected Coordinate Data | **PARTIAL** | Filters global `products` table by string prefix matching |
| Specific Bin Products List | **PARTIAL** | Reads `stock_quantity` from global products array |
| Add/Edit Location | **ABSENT** | Page contains zero CRUD logic to mutate structure |
| Assign Product to Location | **ABSENT** | Page cannot assign products to locations |

## 4. CRUD, Security, and Realtime
- **CRUD Operations:** There are absolutely no CRUD operations on this page. It is a pure, read-only visualization of the mock `ZONES` array intersected with product location strings.
- **Security/RLS:** N/A for Page 10 since it performs no mutations. The `products` table itself is secured by catalog RPCs.
- **Realtime:** No realtime subscriptions exist on this page, which is correct as layout changes are low-frequency.

## 5. End-to-End Location Trace
**Current Flawed Trace:**
Admin cannot use Page 10 to map a product. If a location string is updated via the database or Product Catalog:
1. `products.warehouse_location` is updated to `'A1-R2-S3'`.
2. This applies to ALL warehouses globally.
3. Picker at Warehouse A sees `'A1-R2-S3'`.
4. Picker at Warehouse B ALSO sees `'A1-R2-S3'`, even if their physical layout is entirely different.

## 6. Actionable Recommendations

### REMOVE
The entire `WarehouseLayout.tsx` module. It is a decorative, hardcoded UI that provides zero actual layout management capabilities and creates a false impression of a sophisticated hierarchical warehouse management system.

### MUST FIX
The global `warehouse_location` field on `products` is architecturally invalid for a multi-warehouse system. However, fixing this requires altering the core inventory schema (e.g., adding `warehouse_location` to a warehouse-scoped table), which borders on introducing a "second inventory architecture" and modifying frozen systems. 

### OPTION RECOMMENDATION: OPTION C
**Recommendation:** **OPTION C — REMOVE PAGE**.
All useful layout visualization is completely mock. The only real data is a single text string (`warehouse_location`), which is globally scoped and cannot even be edited from this page. A fully operational multi-warehouse location system would require significant database schema redesign (Option A/B) that conflicts with the frozen Page 5 / Batch architecture. The most honest and clean approach is to delete this decorative page.

## 7. Exact Minimal Implementation Plan
1. **Frontend (`AdminDashboard.tsx` or Sidebar Routing):**
   - Remove `WarehouseLayout` from the available sidebar modules/routes.
2. **Frontend (`WarehouseLayout.tsx`):**
   - Delete the file `src/views/Admin/modules/WarehouseLayout.tsx`.
   - Delete the associated CSS file `WarehouseLayout.css`.
3. **Database:**
   - Leave `products.warehouse_location` as-is so as not to break the Picker app, or (if permitted) migrate it to a warehouse-scoped table (e.g., `dark_store_products`) in a future catalog refactor. For this specific task, no DB changes are required.
