# Project Timeline

## [2026-07-15] Project Resumed
- **Trigger:** User resumed the project after a 6-month pause.
- **Action:** 
  1. Scanned project codebase (Express backend and Next.js frontend).
  2. Identified database schema mismatches in `webhook.js` and `partners.js`.
  3. Identified missing pages in Next.js frontend layout (`/partners` and `/settings`).
  4. Setup `/docs` Project OS system (Playbook, Decision Log, Timeline, State Snapshot).
  5. Confirmed PostgreSQL + Railway as the target architecture.

## [2026-07-15] Codebase Updates & Validation Completed
- **Trigger:** Implementation plan approved.
- **Action:**
  1. Wrote Harness files (`spec.md`, `manifest.json`, `decision-log.md`, `assumptions.md`, `risks.md`).
  2. Updated Postgres database schema (`schema.sql`) to resolve inconsistencies with `webhook.js` and `partners.js`.
  3. Configured WhatsApp catalog ID to support environment variable overrides.
  4. Implemented missing Next.js dashboard pages (`/partners`, `/settings`) with rich premium styling.
  5. Uncommented live API endpoint data-fetching in `/orders` frontend page.
  6. Generated the root `AGENTS.md` configuration.
  7. Ran `npm run build` inside `admin-dashboard` to verify compilation. Build succeeded.

## [2026-07-15] Added GTM & Business Strategy
- **Trigger:** User requested guidance on Go-To-Market, digital marketing, ads, aggregators, and domain expert consulting.
- **Action:**
  1. Created `docs/BUSINESS_GTM_STRATEGY.md` laying out local migration, performance marketing (Meta/Google), marketplaces (Swiggy Minis, ONDC), and defined specialized business advisor agent roles.

## [2026-07-15] Created Deployment Guide
- **Trigger:** User requested a detailed, step-by-step clicks-and-inputs setup guide for moving to production on Railway and Meta.
- **Action:**
  1. Created `docs/DEPLOYMENT_GUIDE.md` containing absolute, step-by-step clicks, navigation targets, and input mappings for Meta Developer portal, WhatsApp Commerce Catalog, Railway database provision, environment setup, and Webhook verification routing.

## [2026-07-16] Resolved Database ENETUNREACH Connection Issue
- **Trigger:** Logs showed `ENETUNREACH` connection error when the Express server on Railway tried to connect to the external database via IPv6.
- **Action:**
  1. Modified `server/src/server.js` to force Node.js to resolve hostname queries using IPv4 first (`dns.setDefaultResultOrder('ipv4first')`).
  2. Staged, committed, and pushed the fix to the GitHub repository to trigger auto-redeploy on Railway.

## [2026-07-18] Completed Pincode Seeding (Phase 1) & Dashboard Panels (Phase 2)
- **Trigger:** User uploaded 23MB India post offices CSV and requested starting Phase 2.
- **Action:**
  1. Updated `seed_pincodes.js` to process and deduplicate 19,586 unique Indian postal codes.
  2. Mounted Settings, Coupons, and Salespeople API controllers in Express server.
  3. Built settings form layout (vacation switch, slot caps, COD premiums, and allowed pincodes tags with search and CSV import parser).
  4. Added Coupons and Salespeople referral panels with commission audit logs.
  5. Implemented Owner-only Cost Price (CP) variant margins restrictions.
  6. Implemented Next.js auth edge middleware with session login credentials.
  7. Compiled Next.js dashboard bundle successfully.

## [2026-07-18] Completed Phase 3 Integration (UPI, OSRM Routing, E2E logs)
- **Trigger:** User requested Phase 3 checkout integrations, OSRM route optimizations, configurable VPA inputs, and analytical conversation logger.
- **Action:**
  1. Updated `seed_pincodes.js` and imported coordinate points for all 19,586 pincodes.
  2. Implemented OSRM path calculation route `/api/partners/route-optimize` and integrated it with multi-stop Google Maps links in orders dispatcher.
  3. Created dynamic UPI VPA configuration inputs in settings panel.
  4. Expanded `conversation_logs` schema and captured E2E incoming/outgoing messages grouped under unique session IDs.
  5. Built Next.js `/analytics` dashboard showing conversion funnel drop-offs and live chat simulator.
  6. Recompiled Next.js dashboard bundle with 100% build success.

## [2026-07-18] Completed Razorpay Sandbox & Campaigns Broadcaster (Phase 3 Extensions)
- **Trigger:** User provided Razorpay Sandbox credentials and requested automatic payments webhook and dashboard marketing campaign broadcaster.
- **Action:**
  1. Added Razorpay API test credentials to `.env` config file.
  2. Implemented signature verification endpoint `/api/webhook/payments` to automate order status confirmations.
  3. Integrated dynamic Razorpay short payment links and custom QR codes in the WhatsApp checkout wizard.
  4. Built Campaigns Broadcaster dashboard pane (`/campaigns`) with text/image broadcast forms and cost logs auditing.
  5. Added `processing_type` tracking (voice vs manual) to E2E conversation logs tables.
  6. Verified the full checkout sequence using a 9-step UAT test suite (greetings, cart limits, serviceable address check, delivery slot buttons, payment links, and capture callbacks) with 100% test success.
  7. Re-compiled Next.js dashboard bundle successfully.

## [2026-07-19] Completed Reliability, Security, & Testing Hardening (Post-Audit Improvements)
- **Trigger:** System audit report revealed bugs (voice MOV bypasses, connection leaks, lack of payments idempotency, fuzzy matching gaps) and security flaws (client-side auth).
- **Action:**
  1. Implemented server-side `x-admin-password` authorization middleware protecting all private admin API routes.
  2. Integrated headers injection in client Axios helper and updated LoginPage cookies.
  3. Implemented payments webhook idempotency guards (via transaction checks), order total validations, and audit logs.
  4. Added Delivery Verification OTP sequence (4-digit codes on out-for-delivery triggers) and verify-delivery complete routes.
  5. Added concurrent user locks in the bot state machine using a Set memory model.
  6. Enforced Minimum Order Value (MOV) checks in Gemini voice ordering checkout paths.
  7. Added wildcards ILIKE matches for fuzzy conversational catalog selections.
  8. Configured automatic retry-backoff handlers in WhatsApp client for rate limit (429) or transient errors (5xx).
  9. Added explicit fallback blocker for unsupported media formats (location pins, stickers, documents).
  10. Added missing button handlers for `btn_orders` and `btn_support` in WhatsApp flows.
  11. Executed and verified the E2E UAT test suite (all 9 test scenarios passing cleanly).
  12. Synchronized database graphs using `graphify`.

## [2026-07-19] Completed Enterprise Security, CRM Panel, CRUD Modals, & Conversational Shortcuts (Final Deliverables)
- **Trigger:** Post-audit inspection highlighted empty dashboard KPIs, missing edit/delete CRUD capabilities, missing CRM intelligence (LTV metrics, recovery flows), and manual welcome greeting repetitions.
- **Action:**
  1. **JWT & Bcrypt Upgrades:** Replaced static password header matching with a standard secure authentication setup (hashed passwords in DB, signed JWT on login, and JWT Bearer authorization middleware protecting all private APIs).
  2. **Live Dashboard KPIs:** Replaced hardcoded dashboard values with real database aggregation queries for revenue, AOV, conversion rate, and referrals.
  3. **Sidebar Responsiveness:** Refactored the dashboard layouts for mobile-friendly viewports and added a collapsible slide-out sidebar toggle button.
  4. **Complete Database CRUD:** Implemented interactive modals to create, read, update, and delete products/variants, delivery partners, and salespeople (including commission settlements).
  5. **CRM Cart Recovery Analytics:** Built analytics showing customer LTV rankings and a checkout recovery center that scans abandoned checkouts and triggers automated recovery reminders.
  6. **DND Opt-Out Compliance:** Enabled literal `"STOP"` commands to opt-out users from campaigns and `"START"` to resume campaign opt-ins.
  7. **Conversational Reorder Shortcuts:** Configured state machine welcoming templates recommending the customer's last order, fast-tracking them directly to payment selection upon confirmation.
  8. **15 E2E UAT Test Validations:** Extended integration test suite verifying COD, DND commands, repeat shortcuts, CRM recovery webhooks, and JWT Bearer authorization blocks. All 15 tests completed with 100% success.
  9. Synchronized codebase dependencies using `graphify`.

## [2026-07-19] Completed Voice STT, Multilingual Toggles & Subscriptions Management (Phases 1, 2, and 3)
- **Trigger:** Start building Phases 1, 2, and 3 as defined in the project roadmap (Sarvam speech STT, Vernacular Hindi/Marathi bot, and Subscription management UI/client controls).
- **Action:**
  1. **Phase 1: Sarvam Saaras Speech-to-Text Integration:** Wired `https://api.sarvam.ai/speech-to-text` with fallback to Gemini 1.5 Flash, OGG granule duration validation to reject large audio files, conversation rate limits, duplicate filtering, and cost markup adjustments to checkout variant prices.
  2. **Phase 2: Vernacular Language Bot:** Migrated database to support user preferred language columns, created dynamic switches (`ENGLISH`, `HINDI`, `MARATHI`) to store preferences, and translated all key messages, warnings, summaries, and buttons.
  3. **Phase 3: Subscription Management:** Created `subscriptions.js` backend private router, built Next.js subscriptions panel dashboard UI with calendar/quantity editor cards and status toggles, and added complete WhatsApp customer interactive schedule managers (Pause, Resume, Cancel, and Create new subscription).
  4. **17 E2E UAT Test Validations:** Extended tests to cover all localized checkout responses, voice, DND, and repeat order paths. All 17 E2E tests succeeded!
