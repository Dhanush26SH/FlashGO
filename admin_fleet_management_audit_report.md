# Admin Fleet Management Core Audit Report

## 1. Existing Architecture & Page Scope
The Fleet Management page (Page 9) (`src/views/Admin/modules/FleetManagement.tsx`) provides an interface for tracking vehicle inventory, assigning vehicles to drivers, and verifying driver compliance (KYC).
- **Backend Entities**: It relies on the `vehicles` and `driver_compliance` tables, and the `current_vehicle_id` field on the `profiles` table.
- **RPCs**: It relies on `assign_vehicle` for mapping a driver to a vehicle.
- **Triggers**: A backend trigger `check_driver_online_guard` strictly enforces that a driver cannot go `is_online = true` unless they have an active assigned vehicle matching their warehouse, and their `driver_compliance` is cleared and unexpired. 

## 2. Real vs Mock Matrix

| Feature / UI Element | Classification | Source |
| :--- | :--- | :--- |
| Vehicles Table (`vehicles`) | **REAL** | `public.vehicles` schema |
| Driver Compliance (`driver_compliance`) | **REAL** | `public.driver_compliance` schema |
| Vehicle Assignment | **REAL** | `profiles.current_vehicle_id` + `assign_vehicle` RPC |
| "Add Vehicle" Action | **REAL** | Raw DML on `vehicles` protected by RLS |
| "Edit Records" (KYC) Action | **REAL** | Raw DML on `driver_compliance` protected by RLS |
| Availability Status (Active/Idle) | **REAL** | Inferred from `public.logistics_trips` |
| Live Tracker Modal | **PARTIAL/DUPLICATE** | Reads `driver_sessions` but duplicates Page 3 |
| Maintenance/Fuel/Odometer | **ABSENT** | FlashGO does not mock these; they do not exist |

## 3. Security Findings
- **Raw DML Safety**: Both `vehicles` and `driver_compliance` mutations are securely protected by RLS (`"Admins can manage vehicles"` and `"Admins can manage compliance"`), ensuring only Admins can perform these updates.
- **RPC Vulnerability**: The `assign_vehicle(p_driver_id, p_vehicle_id)` RPC is marked `SECURITY DEFINER` but **completely lacks caller authorization**. Currently, any authenticated user can call this RPC and assign a vehicle to any driver. Furthermore, it does not prevent reassignment while a driver is currently online or actively on a trip, which could corrupt the `check_driver_online_guard` constraints mid-shift.

## 4. Live-Location Overlap (Page 3)
Page 9 subscribes to `driver_sessions` (`driver_sessions_fleet`) purely to render a "Live Tracker Modal" for individual drivers. 
This is a direct duplication of **Page 3 (Live Delivery Map)**, which already serves as the authoritative, high-density live tracking dashboard for Admin. Having two separate map modules running realtime subscriptions creates unnecessary overhead.

## 5. Availability Derivation
Availability is truthfully derived:
- **Active**: Driver has an `in_transit` trip in `logistics_trips`.
- **Idle**: Vehicle is `active` but driver has no active trip.
- This accurately reflects the backend state without relying on fake frontend toggles.

## 6. Cross-Module Responsibility
- **Staff Approval / Suspension**: Owned by Page 6.
- **Driver Earnings**: Owned by Page 8.
- **Live GPS Tracking**: Owned by Page 3.
- **Trip/Delivery Lifecycle**: Owned by the Driver App & Core Logistics RPCs.
- **Legitimate Fleet Responsibility (Page 9)**: Vehicle inventory (adding/retiring vehicles), Vehicle-to-Driver assignment, and Driver Compliance (DL, RC, Insurance, Background Check) gatekeeping.

## 7. Actionable Recommendations

### MUST FIX
1. **Secure `assign_vehicle` RPC**: Add Admin `role` enforcement. Add checks to block reassignment if the driver is currently `is_online = true` or has an active `logistics_trips` record to prevent state corruption.

### REMOVE
1. **Live Tracker Modal**: Remove the map modal and the `driver_sessions_fleet` realtime subscription from `FleetManagement.tsx`. Rely solely on Page 3 for tracking. Show a static "On Route" or "Idle" text instead.

### OPTION RECOMMENDATION: OPTION A
**Recommendation:** **OPTION A — COMPLETE REAL FLEET MODULE**.
The underlying architecture (`vehicles`, `driver_compliance`, `current_vehicle_id`, and `check_driver_online_guard`) genuinely exists, is functional, and actively gates drivers from going online in the core FlashGO system. Removing this page would leave Admins with no way to approve driver KYC or assign vehicles, completely breaking the driver onboarding lifecycle.

## 8. Exact Minimal Implementation Plan
1. **Migration (`20260830000003_secure_fleet_assignment.sql`)**:
   - `CREATE OR REPLACE FUNCTION assign_vehicle`: Add `auth.uid()` admin check.
   - Add constraint: Prevent assignment/unassignment if `profiles.is_online = true`.
2. **Frontend (`FleetManagement.tsx`)**:
   - Remove `PremiumMap` import and the entire Map Modal rendering.
   - Remove `supabase.channel('driver_sessions_fleet')` subscription.
   - Remove `driverSessions` state completely.
   - Retain all Vehicle and Compliance tables and actions unmodified.
