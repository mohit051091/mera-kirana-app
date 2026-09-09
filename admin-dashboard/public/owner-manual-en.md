# Mera Kirana — Owner Studio User Manual (English)

*Dashboard guide for shop owners and managers. Short version: this panel is the remote control of your WhatsApp shop.*

## 1. Daily routine (5 minutes every morning)

1. Open **Dashboard** — check Today's Orders, Pending Delivery, Revenue.
2. Open **Orders** — confirm new orders, assign a rider, move them OUT_FOR_DELIVERY → DELIVERED.
3. Open **Delivery Team** — mark riders AVAILABLE. Slots on WhatsApp open/close based on this.
4. If anything looks wrong, check **Analytics → conversation logs** for what the customer saw.

## 2. Dashboard (home)

- **Today's Orders / Pending Delivery / Revenue / Active Partners** — live numbers from the database.
- **Manage Orders / Modify Catalog** — shortcuts to the two screens you will use most.

## 3. Orders

- Each row is one customer order with items, address, slot, payment (COD/UPI), status.
- **Confirm** a new order, **assign rider**, then move it through OUT_FOR_DELIVERY (OTP goes to customer) → DELIVERED (enter OTP).
- **Route optimize**: select many orders → get the best delivery sequence + Google Maps link.
- QR button re-shows the UPI payment QR for pending online orders.

## 4. Catalog (Products & Variants)

- A **Product** is a group customers see (e.g. Paneer). A **Variant** is one buyable option (200 gm @ ₹72).
- **Weight**: pick a preset (100 gm … 5 kg) or Custom. **Price**: selling price. **Stock**: units in hand; 0 hides it from sale and Meta.
- **Min–Max / Step**: order quantity rules (e.g. 1–20, step 1).
- **Sync badge**: Synced = same item is live on WhatsApp catalog. Pending push = saved here only (Meta token missing or push failed) — tap **Upload** to push again.
- **Hide/Show**: hides a variant from customers AND removes it from Meta. Never deletes history.
- **Import from Meta**: first-time fill — pulls existing Meta catalog items into this screen. **+ Add weight option**: new variant under the same product.

## 5. Subscriptions

- Daily/weekly repeat deliveries (milk, curd). Pause, Resume, Cancel per customer; edit quantity and next date.
- Customers can also manage from WhatsApp (Subscriptions button).

## 6. Campaigns (WhatsApp broadcasts)

- Send text/image offers to many customers at once. Meta charges per conversation — keep lists small and targeted.
- Customers who replied STOP never receive campaigns (DND law). START opts them back in.
- Check cost logs after every campaign: orders ÷ cost = was it worth it?

## 7. Coupons

- Discount codes (PERCENT or FLAT, e.g. DIWALI10). Set minimum order, start/end dates, max uses.
- Customers apply by typing COUPON <CODE> in chat. Usage counts update automatically; overuse is blocked even if 100 people tap together.

## 8. CRM (win customers back)

- **Abandoned carts**: people who filled a cart but never paid — tap to send a reminder on WhatsApp.
- **LTV ranking**: who your most valuable customers are. Treat the top 20 like gold.

## 9. Analytics

- Conversion funnel: where customers drop (cart → address → slot → payment). Fix the biggest leak first.
- Conversation logs: every WhatsApp message in/out, grouped by chat. Use it to settle "but I ordered X!" disputes.

## 10. Delivery Team

- Add riders (name, phone). Status AVAILABLE = they get orders; BUSY/OFFLINE = skipped.
- **Slot capacity = free riders × Orders-per-Rider (Settings)**. No free riders → WhatsApp shows only tomorrow pre-order slots. This page is your capacity switchboard.

## 11. Sales Agents

- Referral partners with their own code. Commission (percent or flat) auto-added on referred orders.
- Settle payouts here; history is kept per agent.

## 12. Settings (read carefully — money lives here)

- **Checkout & Delivery**: Minimum Order Value, delivery fee + free-above threshold.
- **Payment Adjustments**: COD extra fee, online-payment discount %, legacy per-slot cap, your UPI VPA (where online money lands).
- **Shop Identity & Policy**: FSSAI licence number (prints on every WhatsApp bill — fill your real 14-digit number), refund/replacement policy text (shows before the customer pays).
- **Rider Capacity, Express & Pre-order**: orders per rider per slot; ⚡ Express 10-min fee (0 hides express); 📅 pre-order discount % on tomorrow slots (0 hides it). Pre-orders help you plan inventory — raise the % before festivals.
- **Operating Hours + Vacation Mode**: closed hours block ordering; vacation switch pauses the whole shop with one tap.
- **Voice limits**: how many voice orders per customer per hour/day (abuse control).
- **Pincodes**: where you deliver. Search + toggle; bulk CSV upload allowed.

## 13. Weekly routine (20 minutes, Sunday evening)

1. Check Analytics funnel — fix the worst drop.
2. Review stock in Catalog; Hide whatever is over.
3. Plan one campaign for the week (festival? weekend sweets?).
4. Settle agent commissions.
5. Confirm next week's rider roster in Delivery Team.

## 14. Troubleshooting

- **Order didn't come through?** Analytics → logs → search customer phone. Check DND, pincode allowed, shop open hours.
- **"Couldn't parse catalog order"?** Catalog variant ID missing in database — use Import from Meta, then check Sync badges.
- **Online payment stuck PENDING?** Razorpay keys missing/wrong, or webhook secret mismatch. COD keeps working meanwhile.
- **Login fails in browser but password is right?** Backend ALLOWED_ORIGINS must include your dashboard URL.
- **Never paste tokens/keys into chat or screenshots.** Rotate any key that leaks.
