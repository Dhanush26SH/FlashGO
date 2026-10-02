# Warehouse Tasks — Inward Receipts Investigation Report

## A. Existing Inward Architecture
The current inward receiving architecture strictly follows this flow:
1. **Procurement:** Admin creates and approves `procurement_orders` (POs) from `vendors`.
2. **Dispatch:** Supplier dispatch is optionally recorded in `supplier_dispatch_batches`.
3. **Receiving:** Warehouse Staff (with `inward_damage` duty) scan items via the mobile app.
4. **GRN Commit:** The app calls the atomic RPC `receive_procurement_order`.
5. **Inventory Staging:** The RPC validates barcodes, creates `goods_receipts` and `goods_receipt_items`, increments `warehouse_stock.staging_quantity` (isolating it from available stock), records to `stock_ledgers` (reason: `grn_staging`), and generates `product_batches`.
6. **Putaway:** The RPC creates `putaway_tasks` for the accepted quantities.

## B. Authoritative Completed-Receipt Source
The single authoritative source proving an inward receipt was successfully completed is the existence of a row in the **`public.goods_receipts`** table.

## C. Exact Lifecycle/Statuses
- **In-Progress/Failed:** The backend architecture is strictly stateless for inwarding. The mobile app holds the "in-progress" state. Only a successful, atomic execution of `receive_procurement_order` creates a GRN. Therefore, there are no "draft" or "failed" GRN records in the database. 
- **Discrepancies:** Discrepancies are structurally handled inside `goods_receipt_items` via the `accepted_quantity`, `rejected_quantity`, `damaged_quantity`, and `expired_quantity` columns.
- **Status:** Any record residing in `goods_receipts` is implicitly "Completed".

## D. Proposed Column Mapping (Database Source)
The requested monitoring columns can be safely populated from existing relationships:
- **Date/Time:** `goods_receipts.created_at`
- **GRN/Receipt ID:** `goods_receipts.receipt_number`
- **PO:** `procurement_orders.po_number` (Joined via `goods_receipts.procurement_order_id`)
- **Supplier:** `vendors.name` (Joined via `goods_receipts.vendor_id`)
- **Items:** `COUNT(goods_receipt_items.id)` (Grouped by `receipt_id`)
- **Received Qty:** `SUM(goods_receipt_items.quantity_received)`
- **Received By:** `profiles.full_name` (Joined via `goods_receipts.received_by = profiles.id`)
- **Warehouse:** `warehouses.name` (Joined via `goods_receipts.warehouse_id`)
- **Status:** Hardcoded as "Completed" for all returned rows.

## E. Existing Genuine Data Evidence & RLS
- **RLS Permissions:** The `goods_receipts` table already contains the policy: `"Admin read goods_receipts" ON public.goods_receipts FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))`. 
- **Relationships:** The `received_by` column is explicitly a foreign key to `public.profiles(id)`, ensuring safe resolution of the staff member's name without joining external auth tables.

## F. Existing Admin/Service Code for Reuse
- **Frontend Integration Point:** `src/views/Admin/modules/WarehouseTasks.tsx` explicitly manages the tabs (`putaway`, `audits`, `returns`). The new tab should be added here.
- **Service Layer:** There is currently no global `getInwardReceipts` method. `ProcurementService.ts` currently fetches GRNs only in the context of a specific PO (`getProcurementOrderById`). A new read-only query is needed.

## G. Necessary Migrations
**None.** The schema, relationships, and RLS policies are fully prepared to support this read-only view as-is.

## H. Smallest Safe Frontend-Only Implementation Plan
1. **Service Layer:** Add a `getInwardReceiptsPaginated` method to `InventoryService.ts` or `AdminService.ts` executing a pure Supabase select:
   `.from('goods_receipts').select('*, procurement_orders(po_number), vendors(name), profiles!goods_receipts_received_by_fkey(full_name), goods_receipt_items(quantity_received)')`
2. **UI Component:** Create a read-only `<InwardReceiptsModule />` in `src/views/Admin/modules/WarehouseOperations.tsx` (mirroring the `DataTable` structure of `PutawayModule`).
3. **Tab Routing:** Add the `Inward Receipts` button to the tab array in `src/views/Admin/modules/WarehouseTasks.tsx` and conditionally render the new module.

## I. Interference Risks
**Zero risk.** The proposed implementation is entirely decoupled from Procurement PO management, mobile app RPC execution, and Putaway inventory mutations. It only requires read-only `SELECT` queries against existing RLS-protected tables.
