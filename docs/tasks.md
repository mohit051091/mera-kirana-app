# Task Registry

## Backlog
- [ ] Set up and verify Meta commerce catalog connection.
- [ ] Connect WhatsApp business account and configure phone webhook URL on Meta dashboard.

## Planned (Next Iteration)
- [x] Fix Postgres database schema discrepancies (`conversation_logs` and `partner_availability_logs` creation).
- [x] Write step-by-step guides for user setup (Railway Postgres setup, Meta catalog setup).
- [x] Update frontend `/orders` page to fetch live orders from Express server.
- [x] Create missing frontend page `/partners` to manage delivery team availability.
- [x] Create missing frontend page `/settings` for WhatsApp credentials configuration.

## In Progress
- [ ] None.

## Completed
- [x] Initial codebase audits and dependency graphs generated.
- [x] Developed missing frontend pages `/partners` and `/settings`.
- [x] Verified frontend build successfully.
- [x] Deduplicate and seed 19,586 Indian postal codes from `pincodes.csv`.
- [x] Implement backend settings, coupons, and salespeople controllers.
- [x] Integrate settings control panels (vacation mode, MOV, delivery thresholds, operating schedules, slot capacities, serviceable area tags).
- [x] Create Coupons and Salesperson referral dashboards with commission ledgers.
- [x] Enforce Owner-only Cost Price (CP) margins and mask them for Managers.
- [x] Enforce Cookie-based authentication middleware redirecting to `/login`.
- [x] Compiled Next.js dashboard bundle successfully.
