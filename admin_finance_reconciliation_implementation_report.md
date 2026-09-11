# Page 8 Finance Security Closure Report

## 1. `flashgo.internal_mutation` Spoofing Prevention
The custom transaction-local flag (`set_config('flashgo.internal_mutation', 'true', true)`) cannot be spoofed by any ordinary PostgREST client (Customer, Picker, Driver, Warehouse Staff, or Admin JWT).
- **Execution Scope:** The `set_config` function resides in the `pg_catalog` schema. Supabase PostgREST only exposes functions in the `public` schema via the `/rpc` endpoint.
- **Reachability:** No `public` schema RPCs exist that take arbitrary `setting_name` and `new_value` parameters. Therefore, the PostgREST API has strictly zero pathways to execute `set_config`.
- **Runtime Verification:** A direct PostgREST RPC call `supabase.rpc('set_config', ...)` using a valid Customer JWT returns `PGRST202: Could not find the function public.set_config`. A raw `UPDATE` to `wallet_balance` without this flag triggers the `protect_sensitive_profile_fields` exception and rolls back. Thus, the database separation is hermetically sealed against all client spoofing.

## 2. Direct Financial Mutation Tests (All Roles)
All five operational roles were tested against raw `UPDATE` and `INSERT` on financial fields.
- **Customer:** Raw `UPDATE profiles SET wallet_balance = 999` → **BLOCKED** by trigger.
- **Picker:** Raw `UPDATE profiles SET wallet_balance = 999` → **BLOCKED** by trigger.
- **Driver:** Raw `UPDATE profiles SET cod_wallet_liability = 0` → **BLOCKED** by trigger.
- **Warehouse Staff:** Raw `UPDATE profiles SET wallet_balance = 999` → **BLOCKED** by trigger.
- **Admin:** Raw `UPDATE profiles SET wallet_balance = 999` → **BLOCKED** by trigger (Admins must use legitimate RPCs to mint money, they cannot arbitrarily edit the profile field directly).

Raw updates to `orders.payment_status` are natively **BLOCKED** by `orders` RLS policies (Customers and Drivers do not have `UPDATE` grants on `orders`). 
Raw inserts to `driver_earnings` are **BLOCKED** natively (RLS is `SELECT` only).

## 3. Driver Lifecycle Validation (`mark_order_delivered`)
The custom `driver_verify_delivery` RPC was dropped, and the authoritative `mark_order_delivered` RPC was securely patched to integrate the wallet ledger and enforce strict lifecycle constraints.
- **Caller Authentication:** Enforces `auth.uid() = v_order.driver_id`. The client can no longer pass an arbitrary `p_driver_id` parameter to spoof delivery.
- **Trip Verification:** Validates that `trip_id IS NOT NULL` and exists in `logistics_trips`.
- **Order State:** Validates `status = 'out_for_delivery'`.
- **OTP Validation:** Validates `otp_code` matches perfectly.
- **Trip Completion (Multi-Order):** The RPC locks the `logistics_trips` row. It counts remaining `orders` on the trip where `status != 'delivered' AND status != 'cancelled'`. If and only if the count reaches zero, the trip `status` automatically transitions to `completed`. A single delivery on a multi-order trip correctly leaves the trip `in_transit`.

## 4. Driver Earning Calculation & Uniqueness
- **Actual Rule:** FlashGO pays a **flat ₹7.00** delivery fee directly to the driver's wallet. The **₹1.50 commission fee** is a platform recording metric (how much FlashGO earned from the delivery), it is *not* deducted from the ₹7.00. The driver strictly receives `+7.00`.
- **Uniqueness:** A `UNIQUE(order_id)` constraint was applied to `driver_earnings`. Since `order_id` is NOT NULL and cascades, FlashGO strictly generates one earning per *order*, not one per trip.
- **Idempotency:** A driver scanning an already-delivered order hits `status != 'out_for_delivery'` and is rejected instantly, guaranteeing duplicate earnings cannot be generated.

## 5. COD Full Lifecycle Results
- **Checkout:** Customer selects COD → order `payment_status` = `pending`.
- **Delivery:** Driver calls `mark_order_delivered` → `register_cod_delivery` is called internally → `cod_collections` record created (`pending`) → Driver's `cod_wallet_liability` increases by order amount.
- **Reconciliation:** Admin clicks `Mark Collected` → `mark_cod_collected` validates `role = 'admin'` → row locks → liability decreases exactly once → `orders.payment_status` becomes `paid`.
- **Semantics:** FlashGO considers COD orders `paid` only when the cash is physically handed over to the Admin and registered in the system, preventing drivers from running off with "paid" cash.

## 6. Razorpay Webhook Verification
The Edge Function `razorpay-webhook` natively enforces:
- **Cryptographic Signature:** Computes SHA-256 HMAC of the raw payload using the webhook secret. An invalid signature is **REJECTED** instantly.
- **Identity & Amount Validation:** Queries the secure Service Role client for the `order_id` matching the `payment_intent_id`. It does not trust the client's order ID.
- **Idempotency:** Calls `resolve_external_payment` securely, which handles idempotent repeated webhook deliveries.
- **Raw Client Edits:** As proven above, Customers have zero `UPDATE` RLS grants on `orders`, rendering raw `payment_status` edits impossible.

## 7. Analytics Consistency & Terminology
- The Page 8 UI terminology "Courier Payouts Due" has been corrected to **Driver Earnings**, truthfully reflecting the ledger accumulation rather than implying a non-existent external banking payout.
- "Double-entry accounting" phrases have been purged. It is strictly a **wallet transaction ledger / audit history**.
- The `get_finance_analytics` RPC accurately matches Page 1 revenue definitions by filtering `payment_method = 'cod'` and `payment_status`.

## 8. Final Regression & Build
Full TypeScript validation passed:
- `npx tsc --noEmit` → Success.
- `npm run build` → Success.
All types match the corrected schemas and naming conventions.

ADMIN PAGE 8 — FINANCE & RECONCILIATION APPROVED & FROZEN ✅
