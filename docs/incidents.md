# Incidents Registry

This file tracks technical bugs, outages, and resolution actions to prevent recurring errors.

---

## [2026-07-16] Database Hostname IPv6 Resolution Outage (`ENETUNREACH`)
- **Symptoms:** Express backend failed to connect to Railway/Supabase PostgreSQL database on startup, logging `Error: connect ENETUNREACH <ipv6-address>:5432`.
- **Root Cause:** Node.js v17+ defaults to resolving hostnames to IPv6 addresses first. However, the database environment only accepts incoming IPv4 connections.
- **Fix:** Added `dns.setDefaultResultOrder('ipv4first')` in `server/src/server.js` to force IPv4 DNS pre-resolution.
- **Preventive Action:** Enforce default IPv4 lookup sequences on all external database connectors.

---

## [2026-07-19] Webhook Concurrency Lock Leak
- **Symptoms:** Customers sending unsupported media formats (such as WhatsApp stickers) caused all subsequent texts (like `"Hi"`) to get locked out indefinitely with `[CONCURRENCY LOCK] Request is already in progress`.
- **Root Cause:** Early returns handling invalid formats bypassed the try-finally lock release code, leaving phone numbers locked in the in-memory `activeUserLocks` set.
- **Fix:** Restructured the main route function to place the try-finally lock acquisition/cleanup block at the very entry point, encompassing early format checks and returns.
- **Preventive Action:** Always scope in-memory lock releases inside wrapper `finally` blocks.
