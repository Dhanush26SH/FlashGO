# Staff Workflow Contracts

This document outlines the exact contracts, capabilities, and database state transitions for all worker roles executing order fulfillment tasks. These contracts act as a single source of truth for UI teams implementing the remaining client applications (Driver & Warehouse).

## 1. Picker

Dedicated warehouse workers whose sole responsibility is fulfilling customer orders.

### Contracts

- **Availability & Eligibility:** 
  - To be assigned a task, a Picker must be: `is_online = true`, `is_suspended = false`, and have zero active picking responsibilities.
  - Additionally, they must have a valid Assignment Eligibility window evaluated by `is_worker_eligible_for_assignment(p_staff_id)`.
  - **Eligibility Window (+5 Min Rule)**: A picker remains eligible through the `end_time` of their active shift PLUS an additional 5-minute extension (`shift_end + interval '5 minutes'`).
  - **Shift Reconciliation**: If there are continuous consecutive booked slots (e.g., 5-7 and 7-9), the backend seamlessly transitions the expired slot to `completed` and the consecutive one to `active`. The picker remains continuously eligible, and the +5 minute extension only applies after the absolute *last* slot in the continuous chain.
  - Active picking responsibilities are orders where `picker_id` is the worker's ID and `status IN ('placed', 'picking')`.
- **Assignment:** 
  - Executed via PostgreSQL triggers (`trigger_auto_assign_picker`, `trigger_assign_next_order`, `trigger_worker_goes_online`).
  - Strict FIFO order by `created_at ASC` within the same `warehouse_id`.
- **Start:** 
  - Picker transitions order status from `placed` to `picking`.
- **FEFO Operations:**
  - Secure picking gateway is `pick_fefo_item(p_order_id, p_product_id, p_quantity, p_picker_id)`.
  - Picker undoes a pick via `undo_fefo_pick(p_order_id, p_product_id, p_quantity, p_picker_id)`.
- **Completion:**
  - Secure completion via `complete_picking(p_order_id, p_picker_id)`.
  - Asserts that all order quantities equal picked quantities or have resolved substitutions.
  - Transitions order status from `picking` to `waiting_for_packing`.
- **Next Task:**
  - Atomically, upon successful state transition out of `placed`/`picking`, the oldest `placed` unassigned order in the same warehouse is automatically bound to this worker (unless they went offline).

## 2. Warehouse Staff

General warehouse operators who perform staging, packing, and receiving, but act as a fallback for picking when dedicated Pickers are unavailable.

### Contracts

- **Availability:**
  - Must be `is_online = true`, `is_suspended = false`, and have zero active picking responsibilities.
  - Considered Priority 2 behind dedicated Pickers.
- **Fallback Assignment:**
  - Trigger logic automatically sets `picker_id = staff.id` if no dedicated Picker is eligible.
  - Assigned one active order at a time using identical FIFO logic.
- **FEFO:**
  - Staff reuse the exact same `pick_fefo_item` and `complete_picking` RPCs.
  - Authorization guarantees `auth.uid() = orders.picker_id` regardless of whether the profile is a `picker` or `warehouse_staff`.
- **Packing & Staging (Future Scope):**
  - Expected to manage orders transitioning from `waiting_for_packing` → `packing` → `packed` → `staged` (contracts to be finalized during Warehouse UI phase).
- **Handoff (Future Scope):**
  - Warehouse Staff oversee Driver handoff by validating OTP and marking the order `handed_off`.

## 3. Driver

Logistics workers responsible for the final-mile delivery of staged orders.

### Contracts

- **Eligibility:**
  - Must have `role = 'driver'`, `is_suspended = false`, `is_online = true`.
  - Must have an active registered vehicle (e.g., `current_vehicle_id IS NOT NULL`).
- **Trip:**
  - Assigned delivery orders grouped into trips based on routing logic and vehicle capacity.
- **Handoff:**
  - Driver physically receives the order from Warehouse Staff at the loading bay after verifying it's `staged`.
- **Start:**
  - Driver transitions the order to `delivery` (out for delivery).
- **GPS:**
  - Telemetry service ingests real-time coordinates.
- **OTP:**
  - Security challenge requiring Customer to provide a dynamic PIN at destination.
- **COD:**
  - If the payment method is Cash on Delivery, Driver records exact cash collected and updates `cod_wallet_liability`.
- **Delivered:**
  - Status transition to `delivered`.
- **Earnings:**
  - Upon successful delivery, trip calculations generate Driver payout ledgers.

---

*Note: UI flows must always rely on these DB-driven states rather than maintaining disjoint local client state.*
