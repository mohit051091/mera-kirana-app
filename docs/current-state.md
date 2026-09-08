# Project Current State Snapshot

- **Date:** 2026-09-08
- **Status:** Phases 1-3 code-complete. 2026-09-08 security/hardening pass done (all backend `node --check` OK, Next.js build OK). Railway `pure-strength / mera-kirana-app` is OFFLINE (all deployments REMOVED) — needs redeploy after env vars set. Next step: set 10 missing Railway vars, redeploy, run migrate.
- **Railway live check 2026-09-08:** service OFFLINE at `https://khandelwalktm.up.railway.app`, Postgres ONLINE. Railway vars present: DB_*, WHATSAPP_ACCESS_TOKEN/PHONE_ID/VERIFY_TOKEN only. Missing: WHATSAPP_CATALOG_ID, JWT_SECRET, ADMIN_PASSWORD, SARVAM/GEMINI, RAZORPAY_*, PUBLIC_URL, WHATSAPP_APP_SECRET.

## Accomplishments & Current Setup
- **Phase 1 (Sarvam speech STT):** Integrated Sarvam Saaras-Speech v3 API with fallbacks to Gemini, duration caps, de-duplication, rate limiting, settings dashboard controls, and `voice_cost_markup` percentage configuration.
- **Phase 2 (Vernacular support):** Added language preferences column to database, created Hindi and Marathi command switch listeners (`HINDI`, `MARATHI`, `ENGLISH`), and translated bot templates (greetings, warnings, bills, buttons).
- **Phase 3 (Subscriptions management):** Created `subscriptions.js` Express sub-router and registered it to verifyAdminAuth, developed Next.js dashboard subscriptions manager UI with calendar dates/quantity edits and status updates, and added WhatsApp schedule controls (Pause, Resume, Cancel, Create new subscription wizards).
- **Database Performance Optimization:** Added indexes to the `subscriptions` table on `customer_id` and composite `(status, created_at)` columns to prevent table scans as subscriber volumes scale.
- **Production Server:** Node.js Express server running on Railway connected to Railway PostgreSQL database (`postgres.railway.internal`).
- **One-Time Welcome Audio Caching:** Welcome tip audio notes are generated ONCE via Sarvam TTS, uploaded to Meta's media API, and cached as WhatsApp media IDs in `system_settings` (`welcome_tip_new_media_id_EN/HI/MR`). Webhook dispatches cached media IDs directly, eliminating all external audio URL dependencies (preventing 404 errors) and incurring zero ongoing TTS charges on user messages.
- **WhatsApp Catalog Order Parser:** Exact-match only on `meta_product_retailer_id`/`sku_code`/UUID (price + cheapest fallbacks removed 2026-09-08 as abuse vector). Auto-learn of retailer_id removed. Cart is staged then replaced only on validated matches; unmatched IDs logged, cart never wiped on parse failure.
- **Production Security (hardened 2026-09-08):** bcrypt + JWT (12h, iss `mera-kirana`, jti) with no secret fallbacks — boot fails if `JWT_SECRET`/`ADMIN_PASSWORD` unset. Backdoor `merakirana123` + `NODE_ENV=test` bypass removed. `verifyAdminAuth` enforces issuer. Payments webhook requires `RAZORPAY_WEBHOOK_SECRET`, timingSafeEqual compare, exact-paise check, `ON CONFLICT DO NOTHING` idempotency, failure/refund logging. Subscription pause/resume/cancel + repeat-order scoped by `customer_id` (IDOR fixed). `DELETE /subscriptions/:id` is now soft-cancel. Coupons increment atomically with `max_uses` guard. Order placement has double-tap guard (`metadata.order_placed`), address/slot required + whitelisted, unknown address blocked.
- **Dynamic KPIs:** Home dashboard is wired up with live database aggregators summing revenue, AOV, conversion rate, and active referrals.
- **Mobile Sidebar Toggles:** Added floating burger icons and responsive slide-out animations to sidebar layouts on smaller viewport screens.
- **Full Database CRUD Modals:** Added forms to Create, Read, Update, and Delete products/variants, delivery partners, and salespeople.
- **CRM Cart Recovery Analytics:** Scrapes abandoned carts, displays user Lifetime Value (LTV) summaries, and supports one-click automated cart recovery reminders on WhatsApp.
- **DND Opt-Out Compliance:** Integrates literal `"STOP"` commands to opt-out users from campaigns and `"START"` to resume opt-ins.
- **Conversational Repeat Shortcuts:** Returning users get welcome messages recommending their last confirmed order. One-click button click fast-tracks them to payment selection, copying items and configurations.
- **Passing E2E UAT suite:** Extended tests suite validates 17 distinct operational flows including COD checkouts, CRM triggers, token verification, DND toggles, and reorder bypasses.

## Next Steps
1. Phase 4: Multi-Tenant Architecture (Multiple Shops).
2. Phase 5: Open Network Commerce (ONDC Integration).
