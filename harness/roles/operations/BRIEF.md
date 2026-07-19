# Operations Agent Brief: Mera Kirana

This document guides operations and logistics agents on dispatch tracking, partner onboarding, settings updates, and payout cycles.

---

## 1. Scope of Responsibility
- Configuring store properties (minimum order values, delivery slot ceilings, and allowed postal codes).
- Managing delivery staff, tracking rider statuses, and dispatching multi-stop optimized routes.
- Configuring UPI payment VPA addresses in the admin dashboard settings.
- Auditing salesperson referrals and tracking payout settlements.

---

## 2. Standing Directives

### Delivery Verification
- When an order transitions to `OUT_FOR_DELIVERY`, generate a 4-digit code and dispatch it to the customer.
- Ensure the rider verifies this code via the `/api/orders/:id/verify-delivery` callback before completing fulfillment.

### Route Optimization
- Run route calculations before dispatching riders to ensure shortest batched delivery pathways.
- Expose coordinates points from the database to map multiple coordinate stops.
