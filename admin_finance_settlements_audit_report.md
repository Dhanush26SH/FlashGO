# Admin Finance & Settlements Core Audit Report

## 1. Existing Page Architecture
Page 8 (`FinanceSettlements.tsx`) uses real data connected to `FinanceService` and `AnalyticsService`, but contains dangerous architectural flaws and mock frontend interactions.
- Reads `AnalyticsService.getFinanceAnalytics` for KPI cards.
- Reads `FinanceService.getDriverEarnings` and `getCodCollections`.
- Displays tables for Driver Earnings and COD collections.

## 2. Real-vs-Mock Matrix
| Feature | Classification | Description |
| :--- | :--- | :--- |
| **COD Reconciliations** | **REAL** | `cod_collections` accurately tracks pending driver cash. "Mark Collected" successfully updates status via RPC. |
| **Driver Earnings** | **PARTIAL** | Earnings are tracked in `driver_earnings`, but there is **no external bank settlement** (payouts just credit the FlashGO wallet). |
| **Penalties (Hold/Clear)** | **MOCK** | The UI buttons for "Hold/Clear" in Driver Earnings are purely React `useState` interactions and do not affect the database. |
| **Wallet Checkout/Refund**| **REAL** | `process_checkout` and `process_refund` RPCs securely deduct/refund `profiles.wallet_balance`. |
| **Revenue Calculation** | **BROKEN** | `get_finance_analytics` RPC queries `method = 'cod'`, but the column is actually `payment_method`. This crashes/fails to aggregate. |

## 3. Actual Payment Model
- **Wallet**: Native currency. Secure RPCs decrement on checkout and increment on refund.
- **External**: Razorpay integration exists via edge functions (updates order to `paid`).
- **COD**: Authoritative tracking via `orders.payment_method = 'cod'`, transitioning through `cod_collections` table until Admin marks collected.

## 4. Security Findings (CRITICAL)
- **Massive RLS Vulnerability**: The `profiles` table has a `User update self profile` policy that allows `(auth.uid() = id)`. This allows **any** authenticated user to run `UPDATE profiles SET wallet_balance = 999999 WHERE id = auth.uid()`. There is no trigger blocking `wallet_balance` modifications.
- **Client-Side DML**: `FinanceService.addDriverEarning` uses the frontend Supabase JS client to `insert` into `driver_earnings` and directly `update` `profiles.wallet_balance`. This implies Driver JWTs are allowed to arbitrarily add earnings.

## 5. Data Integrity Findings
- Idempotency is well protected in `process_checkout` and `process_refund` using `idempotency_key` and row-level locks (`FOR UPDATE`).
- Double COD collection is somewhat protected by the RPC, but the `method = 'cod'` bug breaks analytics integrity.

## 6. Procurement-Finance Boundary
- Procurement costs are correctly separated. Page 8 does not conflate PO costs with customer revenue or pretend to have a vendor payout system.

## MUST FIX
1. **Critical Security**: Block direct `wallet_balance` updates on `profiles` via trigger.
2. **Critical Security**: Move `addDriverEarning` to a strict `SECURITY DEFINER` RPC. Revoke direct driver INSERT privileges on `driver_earnings`.
3. **Bug**: Fix `get_finance_analytics` to query `payment_method = 'cod'` instead of `method = 'cod'`.

## SHOULD COMPLETE / REMOVE
- **Remove**: The fake frontend "Hold / Clear Penalty" buttons from the Driver Earnings table.
- **Remove**: The term "Platform Settlements" if it implies external payouts, and explicitly relabel it as "Driver Earnings Ledger".

## Recommendation: OPTION B — REFOCUS PAGE
**Keep only genuine wallet/order/COD/earnings visibility and remove unsupported settlement/accounting functionality.**

The backend has a solid COD and Wallet architecture, but the frontend introduces fake penalty buttons and the security model has a catastrophic flaw. We should clean the frontend, secure the wallet, fix the analytics bug, and rely purely on the existing closed-loop financial model.

## Minimal Implementation Plan
1. **Security Migration**: 
   - Add trigger to `profiles` blocking any `wallet_balance` updates unless initiated by a secure RPC.
   - Create `add_driver_earning` secure RPC.
   - Fix column name in `get_finance_analytics` RPC.
   - Revoke RLS `INSERT/UPDATE` on `driver_earnings`.
2. **Frontend Cleanup**:
   - Strip out the `penalties` state and "Hold/Clear" buttons in `FinanceSettlements.tsx`.
   - Switch `FinanceService.addDriverEarning` to use the new secure RPC.
3. **Runtime Test**: Verify Customer JWT cannot spoof wallet balance or driver earnings. Verify Admin can collect COD successfully.
