# Task Registry

## Backlog
- [ ] Set up and verify Meta commerce catalog connection.
- [ ] Connect WhatsApp business account and configure phone webhook URL on Meta dashboard.

## Planned (Next Iteration)
- [ ] Pilot validation at own shop (50+ orders, ≥30% repeat, 14d zero parse-fails) — see BUSINESS_GTM_STRATEGY.md §4
- [ ] Phase 4: Multi-Tenant Architecture (DEFERRED until pilot validates; tenant isolation + billing spec still to write)
- [ ] Phase 5: Open Network Commerce (ONDC Integration)

## In Progress
- [ ] None.

## Completed
- [x] Phase 1: Sarvam Saaras Speech-to-Text Integration with Gemini Fallbacks, duration checks, cost markup settings, and rate-limiting.
- [x] Phase 2: Vernacular Multi-Language Bot (English, Hindi, and Marathi command toggles, dynamically updated user preferences, and translation cards for welcome back/greeting flows).
- [x] Phase 3: Subscription Management UI (React/Next.js dashboard page with CRUD capabilities and status toggles, unified Express sub-router, and WhatsApp customer schedule controller).
- [x] Initial codebase audits and dependency graphs generated.
- [x] Developed missing frontend pages `/partners` and `/settings`.
- [x] Verified frontend build successfully.
- [x] Deduplicate and seed 19,586 Indian postal codes from `pincodes.csv`.
- [x] Implement backend settings, coupons, and salespeople controllers.
- [x] Integrate settings control panels (vacation mode, MOV, delivery thresholds, operating schedules, slot capacities, serviceable area tags).
- [x] Create Coupons and Salesperson referral dashboards with commission ledgers.
- [x] Enforce Owner-only Cost Price (CP) margins and mask them for Managers.
- [x] Enforce Cookie-based authentication middleware redirecting to `/login`.
- [x] Owner catalog manager: Meta sync service, qty controls, premium Owner Studio + Catalog page, 6 Meta variants seeded (Mawa 4, Paneer 2)
- [x] Security hardening: no secret fallbacks, IDOR fixes, catalog exact-match, order idempotency, payments HMAC/paise/conlict guards
- [x] Set WHATSAPP_CATALOG_ID=1565894964726780 on Railway; service ONLINE
