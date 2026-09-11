# Admin B2B Procurement Core Audit Report

## 1. Actual Business Purpose
**Internal Procurement Only (OPTION A)**
Page 7 represents a genuine internal stock replenishment system where Admins order from suppliers to stock FlashGO dark stores. There is absolutely **no Vendor Marketplace** (external sellers managing their own catalogs/orders) present in the codebase.

## 2. Existing Database Tables
The backend architecture genuinely supports this flow using real tables:
- `vendors`: (id, name, contact_person, email, phone, address, created_at). Represents internal suppliers.
- `procurement_orders`: (id, vendor_id, status, total_cost, warehouse_id, created_at).
- `procurement_order_items`: (procurement_order_id, product_id, quantity, cost_per_unit).

## 3. Trace Procurement → Physical Stock (Crucial Check)
The flow is **authentically wired to the frozen inventory architecture**. 
When an Admin marks a PO as received in the UI, it calls the `receive_procurement_order` RPC. This RPC:
1. Locks the procurement order.
2. Accepts an array of batch data (Batch Number, Expiry Date, Received Qty) gathered from the UI.
3. Inserts into the authoritative `product_batches` table.
4. Upserts `warehouse_stock` reflecting actual physical presence.
5. Inserts into `stock_ledgers` with the reason `'grn'` (Goods Received Note).

This confirms the procurement module does not bypass the strict FEFO/batch architecture.

## 4. Supplier / Vendor UI
**REAL & CLEAN**: The UI strictly handles registering and viewing vendors. There are no fabricated supplier scores, AI ratings, SLA percentages, or financial payout tables.

## 5. Purchase Orders & Lifecycle
**Lifecycle Statuses (Real Schema)**: `pending` $\rightarrow$ `approved` $\rightarrow$ `delivered` (and `cancelled`).
- Admin can select a vendor, add items (including scanning barcodes), set quantities/costs, and submit.
- The UI prompts for real Batch Number and Expiry Date when transitioning to `delivered` (Inwarding).
- **MOCK FINDING**: The UI automatically generates a fake wholesale cost (`itemCost = retailPrice * 0.70`) when selecting a product. This must be removed.

## 6. Financial & Auto-Reordering Features
- **Financial**: No fake accounts-payable or settlement system exists. Total cost is a simple sum of `(quantity * unit_cost)`.
- **Auto-Reordering**: No AI, predicted demand, or auto-procurement exists. The system relies entirely on manual Admin PO creation.

## 7. Security & Realtime Gaps
- **Security**: The `receive_procurement_order` RPC lacks an explicit check ensuring the caller (`p_user_id`) is an authorized `admin` or `warehouse_staff`. It only checks if the warehouse matches.
- **Realtime**: `ProcurementSupplier.tsx` lacks `supabase.channel` subscriptions. PO updates currently require a manual page reload.

## 8. Real-vs-Mock Feature Matrix

| Feature | Status | Notes |
| :--- | :--- | :--- |
| **Vendor Registration** | REAL | Creates records in `vendors`. |
| **PO Creation** | REAL | Inserts into `procurement_orders` and `_items`. |
| **PO Receiving (GRN)** | REAL | Genuninely generates Batches, Stock, and Ledger entries. |
| **Wholesale Cost Generator** | MOCK | UI autofills unit cost as 70% of retail. Must remove. |
| **Realtime Updates** | BROKEN | No subscriptions active. |

---

## 9. Final Recommendation: OPTION A — COMPLETE INTERNAL PROCUREMENT
The backend is highly mature and already correctly integrated with the complex, frozen warehouse inventory system. Removal is not necessary. We should finalize it.

### Minimal Implementation Plan for Page 7
1. **[MUST FIX] Security**: Update `receive_procurement_order` (and `admin_approve_po` if needed) to explicitly validate `v_role IN ('admin', 'warehouse_staff')`.
2. **[MUST FIX] Fake Pricing**: Remove the `price * 0.70` mock wholesale generation in the frontend. Force Admin to enter the real unit cost.
3. **[SHOULD COMPLETE] Realtime**: Add `supabase.channel` subscriptions for `procurement_orders` to instantly reflect approval/delivery status changes.
4. **[ALREADY COMPLETE] Inventory Integration**: Preserve the existing Batch/Ledger receiving logic exactly as it is.

*STOP. Awaiting approval to proceed with the Page 7 Implementation.*
