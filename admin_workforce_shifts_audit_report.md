# Admin Workforce & Shifts Core Audit Report

## 1. Existing Feature Inventory & Real-vs-Mock Matrix

| Feature | Classification | Notes |
| :--- | :--- | :--- |
| **Staff Directory** | REAL | Directly renders from `profiles` via `UsersService.getProfiles()`. Accurately displays roles and suspension status. |
| **Pending Approvals** | REAL | Correctly identifies `is_pending_staff = true`, allows admin role assignment, and calls `UsersService.approveStaffRole`. |
| **Role/Warehouse Reassignment** | BROKEN | Admin can reassign a warehouse on an already-approved staff member, but it uses direct `supabase.from('profiles').update()`. This violates RLS policies (Admin cannot update other profiles directly). Must be migrated to an RPC. |
| **Suspension/Reactivation** | ALREADY COMPLETE | Calls secure `suspend_profile` and `unsuspend_profile` RPCs. Suspension is strictly enforced at the database level for Picker and Driver operations. |
| **Shift Scheduler** | PARTIAL | Uses genuine `staff_shifts` table and `StaffService.ts` API. But it relies on hardcoded strings (Morning/Evening/Night) parsing to static hours. Requires a small refactor to make it fully flexible and complete. |
| **Attendance Updates** | REAL | Updates `staff_shifts.status` ('present', 'absent') successfully via `StaffService.updateShiftStatus`. |
| **Performance Stats** | MOCK / REMOVE | "0 Damaged / 0 Missing" is hardcoded into the component. `getStaffKPIs()` returns fake static data. |
| **Payroll / Earnings** | MISSING / REMOVE | Internal state `activeTab` lists 'payroll' and 'cod', but they are completely unrendered. No payroll engine exists in the architecture. |
| **Realtime** | BROKEN | `StaffManagement.tsx` currently has zero active Supabase subscriptions. Status changes require a full page refresh. |
| **Cross-App Integration** | REAL | The pipeline from new customer account $\rightarrow$ `request_staff_access` $\rightarrow$ Admin approval $\rightarrow$ Staff App access works securely using RPCs. |

## 2. Detailed Findings

### Staff Onboarding
The onboarding architecture is robust. A customer requests staff access via `request_staff_access`, which sets `is_pending_staff = TRUE` securely. The Admin can then approve them using `approve_staff_role` which assigns the correct `role`, `warehouse_id`, and a generated `employee_id`.
*Note*: The frontend UI randomly generates the `EMP-1234` ID via `Math.random()`. While crude, it is functional.

### Role/Warehouse Assignment & Security
The initial assignment of a warehouse during approval is secure because it passes through the `approve_staff_role` `SECURITY DEFINER` RPC. However, changing an *already approved* staff member's warehouse is done via a raw `UPDATE` to the `profiles` table. Because `profiles` RLS only allows a user to update their *own* profile, this action currently fails silently or throws an RLS error. 
*Fix needed*: A secure Admin RPC (e.g., `admin_update_staff_warehouse`) is required.

### Suspension
Suspension is comprehensively implemented. The Admin UI calls `suspend_profile`, and database RPCs for operational actions (`pick_fefo_item`, `start_trip`, `claim_trip`) all have hardcoded checks for `is_suspended = TRUE`. A suspended picker is physically unable to interact with FEFO stock.

### Shifts & Attendance
A real `staff_shifts` table exists with RLS, and `StaffService` supports creating shifts and marking attendance. It is not a fake prototype. However, it only supports 3 hardcoded shift times (06-14, 14-22, 22-06). This feature just needs UI polish to be complete.

### Performance & Productivity
All productivity metrics shown on the page (e.g., Damaged items, Missing items, rating numbers) are mocked.

## 3. Required Action Plan

### MUST FIX
- **Security:** Replace the direct `supabase.from('profiles').update({ warehouse_id })` call with a secure `admin_update_staff_warehouse` RPC to allow Admins to safely reassign staff to different dark stores.
- **Realtime:** Add `supabase.channel` listeners to `profiles` and `staff_shifts` to automatically update the directory and pending list when a new request arrives or a shift is modified.

### SHOULD COMPLETE
- **Shift Management:** Make the Shift Scheduler dropdown use standard local time, and ensure it correctly handles edge cases. 

### REMOVE
- **Fake Performance Metrics:** Remove the hardcoded "0 Damaged / 0 Missing" UI elements and the mock `getStaffKPIs()` function entirely.
- **Unused Tabs:** Remove 'payroll' and 'cod' from the internal state as they are unrendered and out of scope.

### ALREADY COMPLETE
- **Staff Onboarding Flow**
- **Database Suspension Guardrails**
- **Employee Directory Rendering**
