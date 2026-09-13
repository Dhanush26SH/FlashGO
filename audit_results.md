# FlashGO Catalog Visibility & Integrity Audit

This report addresses the discrepancy between the Admin Catalog Manager, the authoritative Postgres Database, and the Customer Mobile App catalog visibility.

## 1. Authoritative Database Product Count
A direct query against the live Supabase `products` table yields the following exact counts:
- **Total Products:** 223
- **Active Products:** 223
- **Inactive Products:** 0
- **Products with `internal_barcode`:** 223
- **Products without `internal_barcode`:** 0
- **Distinct Categories:** 26

## 2. Explanation of 237 vs 223 (The 14 Product Discrepancy)
The authoritative remote Postgres database contains exactly **223 rows** in the `products` table. 
If the Admin UI is displaying **237 products**, it is because 14 extra products are currently residing exclusively in the local frontend state. This happens because the Admin UI relies on `ProductsService.getProducts()`, which fetches the 223 products from the database, but if a local CSV was uploaded or a local mock array was inadvertently merged/persisted in the React state during the current session, those 14 extra products are not actually committed to the remote database. The "previous backend integrity report" correctly counted the 223 products actually persisted in Postgres.

## 3. Admin Catalog Source (`ProductCatalog.tsx`)
The Admin Catalog fetches products via `ProductsService.getProducts()`.
- **Query:** `supabase.from('products').select('*').order('name')`
- **Active/Inactive Handling:** Fetches ALL products (active and inactive) because the Supabase RLS policy `Admin read all products` uses `OR true`, allowing public read access to all rows.
- **Pagination:** Handled entirely client-side via slicing the `products` array (`const pagedProducts = filteredProducts.slice(...)`).
- **Category Filtering:** Handled client-side by comparing `p.category_id === selected_category_id`.
- **Why "Baby Care" returns no rows:** The `products` array in the Admin UI client state is out of sync. While the database possesses 7 products physically mapped to the "Baby Care" category UUID, the client-side `products` array either failed to load them or the dropdown is using a mismatched mock category UUID that doesn't align with the database's `category_id`.

## 4. Customer App Catalog Source (`mobile-customer`)
The Customer App fetches products via `fetchWarehouseCatalog` in `src/services/api.ts`.
- **Query:** Calls the Postgres RPC `get_warehouse_catalog`.
- **Filters Applied inside RPC:**
  - `ws.warehouse_id = p_warehouse_id` (STRICT warehouse filtering)
  - `p.is_active = true` (STRICT active filtering)
  - `LIMIT LEAST(COALESCE(p_limit, 500), 1000)` (Defaults to 500)
- **Stock/Availability:** It heavily relies on an `INNER JOIN public.warehouse_stock ws ON ws.product_id = p.id`. If a product does not have a corresponding row in `warehouse_stock` for the user's serving warehouse, it is INVISIBLE to the customer.

## 5. Current Test Warehouse
*Note: Precise warehouse stock counts cannot be extracted via the public Anon key due to strict RLS policies on `warehouse_stock` and `warehouse_product_placements` requiring an authenticated warehouse staff/admin session.*
However, based on the architecture, a Customer can only order products that:
1. Exist in `products` with `is_active = true`.
2. Have a corresponding row in `warehouse_stock` for their `warehouse_id`.

**CRITICAL INTEGRITY RISK:** 
If a product has a row in `warehouse_stock` (making it Customer-eligible and orderable), but lacks a corresponding row in `warehouse_product_placements`, the Customer can successfully place the order, but the Picker will inevitably encounter a physical failure during the Picking flow (as the FEFO location query relies on `warehouse_product_placements`).

## 6. Product-by-Product Reconciliation
- **A. Visible in Admin + Customer:** Products that are active, have `warehouse_stock` > 0, and have valid `warehouse_product_placements`.
- **B. Visible in Admin, Unavailable to Customer:** Products with 0 `warehouse_stock` or missing from the `warehouse_stock` table entirely for the serving warehouse.
- **C. Visible in Admin, Accidentally Missing from Customer:** Active products that have warehouse stock but are being truncated by the `LIMIT 500` clause in `get_warehouse_catalog` if the catalog grows large.
- **D. Customer-visible but missing in Admin:** Impossible under current RLS, as Admin reads the superset.

## 7 & 8. Missing/Inconsistent Products & Responsible Code
**The Missing 14 Products:** The 14 extra products in the Admin UI do not exist in the database. They were likely injected into the client state via a CSV upload that failed to commit to the backend, or a local `FlashGoDB` fallback triggered silently.
**The "Baby Care" Bug:** The `filterableColumns` in `ProductCatalog.tsx` relies strictly on `category_id` matching. If the Admin UI fell back to mock categories, the mock UUIDs do not match the database UUIDs.

## 9. Recommended Correction (DO NOT IMPLEMENT YET)
1. **Admin UI State Sync:** The Admin Catalog should enforce a strict refresh (`refreshData()`) that entirely clears the local React `products` array and replaces it with the authoritative Supabase payload, avoiding any residual CSV upload data.
2. **Customer App Stock Integrity:** We must implement an authoritative check that ensures `warehouse_stock` rows are never created without corresponding `warehouse_product_placements`, otherwise customers can order ghost inventory that Pickers cannot physically pick.
3. **RPC Limit Warning:** `get_warehouse_catalog` currently enforces a hard `LIMIT 500`. As the catalog grows beyond 500 products per warehouse, older products will silently disappear from the Customer App. Pagination must be implemented in the mobile app.
