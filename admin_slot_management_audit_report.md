# Admin Slot Management Core Audit Report

## 1. Page Architecture & Business Meaning
- **Component:** `src/views/Admin/modules/SlotManagement.tsx`
- **Actual Business Meaning:** **D. Staff Shifts (Gig Worker / Picker Management)**.
- **Evidence:** The database tables powering this page (`slots` and `slot_bookings` from `20260803_create_slots.sql`) contain fields like `payout_min`, `payout_max`, and specifically reference `picker_id`. This proves it was designed for gig-worker shift scheduling, not customer delivery windows or warehouse throughput capacity.
- **Duplication:** Because Page 6 (Workforce & Shifts) and the Driver session architecture already provide authoritative worker management, Page 11 represents a redundant, orphaned subsystem.

## 2. Customer Checkout & Order Integration
- **Integration:** **ABSENT**.
- The frozen Customer checkout flow does **not** allow users to select delivery slots.
- The `orders` schema contains absolutely no slot-related columns (`slot_id`, `scheduled_at`, `delivery_window`, etc.).
- **Instant Delivery Compatibility:** FlashGO is positioned as an instant quick-commerce platform (e.g., 10-15 minute delivery). A scheduled delivery slot module fundamentally conflicts with the core "order now / fast delivery" UX.

## 3. Slot Schema & Warehouse Scoping
- **Tables:** `slots` and `slot_bookings` exist.
- **Warehouse Scoping:** **BROKEN**. The `slots` table uses a simple `store_location TEXT` column instead of an authoritative `warehouse_id UUID` reference. This means slots are not correctly integrated into FlashGO's multi-warehouse relational model.

## 4. UI Real-vs-Mock Matrix

| Feature / UI Element | Classification | Source |
| :--- | :--- | :--- |
| Slot Cards / List | **REAL** | Fetched from `slots` table via Supabase |
| Add / Publish Slot | **REAL** | Inserts into `slots` (though flawed structure) |
| Booked Count | **REAL** | Aggregated from `slot_bookings` |
| Store Location String | **REAL** | Reads `store_location` TEXT (but non-relational) |
| Date / Time Filters | **REAL** | Standard SQL equality checks |
| Payout Ranges | **REAL** | Directly persisted in `slots` |
| Customer Availability / Checkout | **ABSENT** | Does not exist |

## 5. Security & CRUD Operations
- **Direct DML:** Page 11 uses direct DML (`supabase.from('slots').insert(...)`) without secure RPCs.
- **RLS Issues:** The RLS policies on `slots` and `slot_bookings` are overly permissive prototypes (e.g., `USING (true) WITH CHECK (true)` for all authenticated users). This means any Customer or Driver could theoretically create, book, or delete shifts if they reverse-engineered the API.
- **Concurrency:** Bookings rely on client-side counting and lack atomic `FOR UPDATE` transaction locks, guaranteeing race conditions if multiple workers tried to claim a capacity-limited shift.

## 6. Actionable Recommendations

### REMOVE
The entire `SlotManagement.tsx` module. It is an orphaned gig-worker shift system that duplicates the frozen Page 6 Workforce architecture, possesses broken warehouse scoping, uses dangerously insecure RLS, and has zero integration with actual Customer orders or the logistics lifecycle.

### OPTION RECOMMENDATION: OPTION C
**Recommendation:** **OPTION C — REMOVE PAGE**.
The Slot system does not represent customer delivery windows, and FlashGO's instant-delivery model does not require scheduled checkout slots. The gig-worker shift functionality it attempted to build is already handled authoritatively by Page 6. Removing this page resolves architectural duplication and eliminates severe RLS security vulnerabilities.

## 7. Exact Minimal Implementation Plan
1. **Frontend (`AdminDashboard.tsx` or Sidebar Routing):**
   - Remove `SlotManagement` from the sidebar routes and components.
2. **Frontend (`SlotManagement.tsx`):**
   - Delete `src/views/Admin/modules/SlotManagement.tsx`.
   - Delete `SlotManagement.css`.
3. **Database (Cleanup):**
   - No immediate schema changes are strictly necessary for the frontend to be removed, but a subsequent migration should `DROP TABLE public.slot_bookings; DROP TABLE public.slots;` to eliminate the insecure prototype tables.
