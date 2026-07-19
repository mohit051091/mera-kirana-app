# Deployments Registry

This file tracks production release versions, risk metrics, and rollback procedures.

---

## [2026-07-16] v1.1.0 — Hostname IPv4 DNS Resolution Patch
- **Risk Level:** Low.
- **Changes:** Enforce IPv4 hostname query resolution first inside `server.js` using `dns.setDefaultResultOrder`.
- **Rollback Plan:** Revert commit `dns-ipv4first` and restart server.
- **Result:** Success (Database connection established successfully on Railway).

---

## [2026-07-19] v1.2.0 — Enterprise Security, Dynamic KPIs & CRM Release
- **Risk Level:** Medium (Modifies API security wrappers and authentication interfaces).
- **Changes:** Upgraded Express backend to JWT verification. Replaced cleartext auth with dynamic KPI analytics, interactive CRUD modals, and CRM recovery panels.
- **Rollback Plan:** Revert auth routes to previous config and restore original cookie keys.
- **Result:** Success (Compiled Next.js admin dashboard and verified via 15 E2E integration test runs).
