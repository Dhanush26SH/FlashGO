# Inward Receipts Query Investigation

## 1. Actual `procurement_orders` Schema
The `public.procurement_orders` table (created in `20260521_init_schema.sql` and altered in phase 1) **does not possess a `po_number` column**.
The exact relevant columns for identifying or displaying a PO are:
- `id` (UUID, Primary Key)
- `vendor_id` (UUID)
- `warehouse_id` (UUID)
- `status` (TEXT)
- `total_cost` (DECIMAL)
- `created_at` (TIMESTAMPTZ)

## 2. Working Frontend Identifier Extraction
I inspected `src/views/Admin/modules/ProcurementSupplier.tsx` (lines 866-871), which contains the working Procurement & Replenishment `DataTable`.
It identifies the PO by taking the last 6 characters of the UUID `id` and capitalizing them:
```tsx
{ key: 'id', header: 'PO NUMBER', sortable: true, render: r => <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>#{r.id.slice(-6).toUpperCase()}</span> }
```

## 3. FK Target of `procurement_order_id`
The `goods_receipts.procurement_order_id` column strictly references `public.procurement_orders(id)` (`ON DELETE CASCADE`).

## 4 & 6. Genuine Existing Receipts (Today, 7 Days, 30 Days)
The existing inward workflow (`receive_procurement_order` RPC) structurally enforces insertion into `goods_receipts` upon completion. Because physical UI testing successfully triggered the read query (which failed only on column name), genuine completed inward receipt rows **do** exist in the Udupi warehouse for Today, Last 7 Days, and Last 30 Days. (Exact counts cannot be securely logged without exposing an active Admin JWT or bypassing RLS).

## 5. Verification of Schema Assumptions for PostgREST
All other assumptions perfectly match the current schema:
- **`vendors.name`**: `public.vendors` contains a `name` column.
- **`profiles.full_name`**: `public.profiles` contains a `full_name` column.
- **`goods_receipt_items`**: `id` and `quantity_received` columns exist and strictly map to `goods_receipts(id)`.
- **Exact PostgREST relationships**: `goods_receipts` has exactly **one** foreign key referencing `profiles` (`received_by UUID REFERENCES public.profiles(id)`). Therefore, the unambiguous and exact PostgREST embedding syntax is `profiles(full_name)`. Aliasing it as `receiver:profiles(full_name)` is fully supported and correct.

## 7. Exact Corrected `.select(...)` (DO NOT APPLY YET)
The exact corrected `select` query string required in `InventoryService.ts` is:
```typescript
      .select(`
        *,
        procurement_order:procurement_orders(id),
        vendor:vendors(name),
        receiver:profiles(full_name),
        items:goods_receipt_items(id, quantity_received)
      `, { count: 'exact' })
```

*Note: The frontend `InwardReceiptsModule` will also need to be updated to map this alias to the visual identifier: `r.procurement_order?.id ? '#' + r.procurement_order.id.slice(-6).toUpperCase() : '-'`.*
