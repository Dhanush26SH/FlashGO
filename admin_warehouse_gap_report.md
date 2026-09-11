# FLASHGO — FINAL ADMIN + WAREHOUSE MANAGER BLINKIT-STYLE GAP REPORT

## Master Audit Table

| Capability | Current Status | Existing UI | Existing Backend | Missing Pieces | Priority | Existing Page / New Page | Database Change Required | Estimated Implementation Complexity |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| A. COMMAND CENTER | PARTIAL | OverviewDashboard | Aggregates | Warehouse health drill-down, actionable operational exceptions | P1 | Extend OverviewDashboard | No | Medium |
| B. ORDER OPERATIONS | COMPLETE | OrderManagement | orders | - | P2 | - | No | Low |
| C. DARK STORES | PARTIAL | FleetManagement | warehouses | Serviceability toggles, capacity limits | P1 | Extend FleetManagement | Yes (New columns) | Low |
| D. INVENTORY/WMS | COMPLETE | InventoryWarehouse | stock_ledgers | - | P2 | - | No | Low |
| E. PUTAWAY | MISSING | None | inward_stock_batch | Explicit putaway bin allocation / worker task generation | P1 | New Page: Putaway & Bins | Yes (bin tables) | High |
| F. INTERNAL REPLENISHMENT | MISSING | None | None | Replenishment logic from reserve to pick-face | P2 | New Page: Replenishment | Yes | High |
| G. CYCLE COUNT / STOCK AUDIT | MISSING | None | None | Cycle count creation, assignment, variance approval | P1 | New Page: Cycle Counts | Yes | High |
| H. SHRINKAGE / WRITE-OFF | COMPLETE | WarehouseBatches | adjust_batch | - | P2 | - | No | Low |
| I. PROCUREMENT / INWARD | COMPLETE | Procurement | procurement | - | P2 | - | No | Low |
| J. PICKING | COMPLETE | Picker App | pick_fefo_item | - | P2 | - | No | Low |
| K. PACKING | MISSING | None | None | Waiting for packing list, packer assignment, bag generation | P0 | New Page: Packing | Yes (packing tables) | High |
| L. STAGING | MISSING | None | None | Bag to staging location linking, dispatch readiness | P0 | Extend Packing Page | Yes | Medium |
| M. COURIER HANDOFF | MISSING | None | None | Driver OTP verification, order bag handoff timestamp | P0 | New Page: Dispatch/Handoff | No | Medium |
| N. DELIVERY | COMPLETE | Driver App | trips | - | P2 | - | No | Low |
| O. CROSS-WAREHOUSE TRANSFER | MISSING | None | None | Transfers between dark stores | P2 | New Page: Transfers | Yes | High |
| P. RETURNS / RETURN-TO-STORE | MISSING | None | None | Return reasons, disposition (discard, restock), refund link | P1 | New Page: Returns | Yes | High |
| Q. CANCELLATION | PARTIAL | OrderManagement | cancels | Deep refund integration, physical inventory restoration logic | P0 | Extend OrderManagement | No | High |
| R. CATALOG | COMPLETE | ProductCatalog | products | - | P2 | - | No | Low |
| S. PRICING/PROMOTIONS | COMPLETE | MarketingCMS | promotions | - | P2 | - | No | Low |
| T. WORKFORCE | COMPLETE | StaffManagement | shifts | - | P2 | - | No | Low |
| U. WAREHOUSE MANAGER ROLE | MISSING | None | roles | True isolated WMS manager role distinct from global Admin | P0 | N/A (Role update) | No (Policy change) | High |
| V. WORKFORCE PRODUCTIVITY | MISSING | None | None | Throughput calculation, real-time picking metrics | P1 | Extend Analytics | No | Medium |
| W. FLEET | COMPLETE | FleetManagement | vehicles | - | P2 | - | No | Low |
| X. FINANCE | COMPLETE | Finance | wallet | - | P2 | - | No | Low |
| Y. SUPPORT/CRM | COMPLETE | SupportSettings | tickets | - | P2 | - | No | Low |
| Z. NOTIFICATIONS | COMPLETE | NotificationCenter | notif | - | P2 | - | No | Low |
| AA. ANALYTICS | COMPLETE | AnalyticsReports | DB views | - | P2 | - | No | Low |
| AB. AUDIT/SECURITY | COMPLETE | AuditLogs | audit | - | P2 | - | No | Low |
| AC. PLATFORM SETTINGS | COMPLETE | PlatformSettings | settings | - | P2 | - | No | Low |
| AD. REPORTS | COMPLETE | AnalyticsReports | various | - | P2 | - | No | Low |

## P0 — MUST IMPLEMENT
- **PACKING**: Critical missing step between picking and delivery.
- **STAGING**: Essential dark store flow for holding bags for drivers.
- **COURIER HANDOFF**: Verification that drivers picked up the correct items.
- **CANCELLATION DEEP LOGIC**: Exacting physical inventory restoration on cancelled orders.
- **WAREHOUSE MANAGER ROLE**: Implementing isolated WMS role separate from super admin.

## P1 — IMPORTANT
- COMMAND CENTER: Actionable alerts for backlog/health.
- DARK STORES: Serviceability toggles.
- PUTAWAY: Bin allocations for received goods.
- CYCLE COUNT: Formal count/variance workflow.
- RETURNS: Return to store disposition flow.
- WORKFORCE PRODUCTIVITY: Realtime picking throughput.

## P2 — DEFER UNTIL CORE COMPLETE
- INTERNAL REPLENISHMENT (Advanced WMS)
- CROSS-WAREHOUSE TRANSFER (Advanced Logistics)

## NEW PAGES REQUIRED
- **Warehouse Packing & Staging**: For warehouse staff to confirm items, pack bags, and stage.
  - Role: Warehouse Staff
  - Backend: New `packing_bags` or equivalent tables.
- **Dispatch / Handoff**: For dispatch managers to scan driver IDs and handoff staged bags.
  - Role: Warehouse Staff / Manager
- **Cycle Counts**: For creating and approving stock counts.
  - Role: Warehouse Manager
- **Returns Disposition**: Processing returned/damaged items physically.
  - Role: Warehouse Manager

## EXISTING PAGES TO EXTEND
- **OrderManagement**: Add deep physical cancellation restoration logic.
- **OverviewDashboard**: Add actionable alerts.
- **FleetManagement**: Add Dark Store serviceability toggles.
- **AnalyticsReports**: Add worker productivity dashboards.

## WAREHOUSE MANAGER ROLE GAP
The current system lacks a restricted `warehouse_manager` role that has access *only* to operations for their specific `warehouse_id`. Currently, any admin access grants global platform visibility.

## ACTIVE MOCK / DEAD UI FINDINGS
- Minimal mock data exists. The `AdminProfile` explicitly commented out mock features.
- Some minor chart metrics in Analytics may rely on incomplete views if throughput tracking isn't live.

## DATABASE / INVENTORY RISKS
- Adding Packing and Staging will require modifying the order lifecycle logic to insert these statuses between `picked` and `out_for_delivery`. This requires updating the trip assignment triggers carefully.
- Aggregate mutation via legacy `admin_adjust_stock` must be fully deprecated in favor of `adjust_batch_stock` to prevent ledger divergence.

## FINAL RECOMMENDED SIDEBAR
1. Overview (Command Center)
2. Order Desk
3. Dispatch & Live Map
4. Inventory & Batches
5. Packing & Staging (NEW)
6. Cycle Counts & Returns (NEW)
7. Procurement
8. Fleet & Dark Stores
9. Catalog Manager
10. Finance & Support
11. Admin & Platform

## IMPLEMENTATION ORDER FOR NEXT 2 DAYS
1. Warehouse Manager Role & Security RLS policies (Foundation)
2. Packing & Staging UI + Backend (Core missing flow)
3. Courier Handoff / Dispatch (Core missing flow)
4. Deep Cancellation Logic (Inventory Safety)
5. Cycle Counts (Inventory Accuracy)
6. Returns Disposition (Inventory Accuracy)

---
ADMIN CURRENT COMPLETENESS: 85%
WAREHOUSE MANAGER CURRENT COMPLETENESS: 60%

P0 FEATURES MISSING: 5
P1 FEATURES MISSING: 6
NEW PAGES REQUIRED: 4

READY FOR 2-DAY IMPLEMENTATION SPRINT: YES
