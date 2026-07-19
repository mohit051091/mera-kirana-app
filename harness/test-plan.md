# Test Plan: Mera Kirana Bot & Admin Panel

This document defines verification scenarios across the five core testing categories required for production hardening.

---

## 1. Happy Path Testing
- **Scenario 1.1: Greeting & Login**
  - Input: User texts "Hi".
  - Expected: Bot creates a customer profile and returns catalog category selection menus.
- **Scenario 1.2: Catalog Additions**
  - Input: User selects curd option.
  - Expected: Cart created and variant items successfully stored.
- **Scenario 1.3: Serviceable Address**
  - Input: User inputs location within Bhandup (400078).
  - Expected: Address saved, pincode verified.
- **Scenario 1.4: Delivery Slot Selection**
  - Input: Click Morning slot button.
  - Expected: Slot committed to metadata state.
- **Scenario 1.5: UPI Confirmation**
  - Input: User selects Online Payment.
  - Expected: Short Razorpay link and VPA QR generated.
- **Scenario 1.6: COD Confirmations**
  - Input: User selects Cash on Delivery.
  - Expected: Order committed in `CONFIRMED` status.
- **Scenario 1.7: Repeat Order shortcut**
  - Input: Click "Repeat Last Order" welcome reply.
  - Expected: Clears current draft, copies past confirmed order items, and routes directly to payment confirmation.

---

## 2. Negative/Invalid Input Testing
- **Scenario 2.1: Unserviceable Pincodes**
  - Input: Pincode 110001 (Delhi).
  - Expected: Order blocked, drop-off logged, alert user.
- **Scenario 2.2: Unauth API Access**
  - Input: Query `/api/products` without standard JWT header.
  - Expected: Block request, return status code 401.
- **Scenario 2.3: Unsupported Media attachment**
  - Input: WhatsApp stickers or contact attachment.
  - Expected: Graceful fallback alert, zero server crash.

---

## 3. Edge/Boundary Testing
- **Scenario 3.1: Below Minimum Order Value**
  - Input: Checkout with ₹80 curd (MOV threshold is ₹150).
  - Expected: Block checkout, request customer add more items.
- **Scenario 3.2: DND Opt-Out and Opt-In**
  - Input: Text `"STOP"` to bot.
  - Expected: Set `dnd_active = true`, block marketing campaigns.
  - Input: Text `"START"` to bot.
  - Expected: Set `dnd_active = false`, resume campaigns.

---

## 4. Concurrent Usage (Race Conditions)
- **Scenario 4.1: Rapid-fire messages**
  - Input: Two webhooks for the same phone number dispatched in under 10ms.
  - Expected: Concurrency locks intercept the second request, returning a warning instead of creating duplicate carts.

---

## 5. External Dependency Failures
- **Scenario 5.1: Razorpay API Outage**
  - Action: Mock Razorpay link generation failing or timing out.
  - Expected: Bot catches error, logs failure, and offers a backup raw UPI VPA QR code stream.
- **Scenario 5.2: Meta API Cost Failures**
  - Action: Mock Meta API template triggers returning 400 bad requests during CRM recovery.
  - Expected: Cart recovery loop catches error, records failure, and keeps running without crash.
