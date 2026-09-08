# Incidents Registry

This file tracks technical bugs, outages, and resolution actions to prevent recurring errors.

---

## [2026-07-16] Database Hostname IPv6 Resolution Outage (`ENETUNREACH`)
- **Symptoms:** Express backend failed to connect to Railway/Supabase PostgreSQL database on startup, logging `Error: connect ENETUNREACH <ipv6-address>:5432`.
- **Root Cause:** Node.js v17+ defaults to resolving hostnames to IPv6 addresses first. However, the database environment only accepts incoming IPv4 connections.
- **Fix:** Added `dns.setDefaultResultOrder('ipv4first')` in `server/src/server.js` to force IPv4 DNS pre-resolution.
- **Preventive Action:** Enforce default IPv4 lookup sequences on all external database connectors.

---

## [2026-09-09] Migration Crash: Invalid `ADD CONSTRAINT IF NOT EXISTS` Syntax
- **Symptoms:** `node seed_catalog_products.js` failed on Railway with `SEED_ERR column "min_quantity" of relation "product_variants" does not exist`; migrate logs stopped before qty columns.
- **Root Cause:** `migrate.js` used `ALTER TABLE payment_logs ADD CONSTRAINT IF NOT EXISTS ...`, which is not valid PostgreSQL syntax (PG supports `ADD COLUMN IF NOT EXISTS` but not `ADD CONSTRAINT IF NOT EXISTS`). The error aborted the transaction block, so all later ALTERs (qty columns) never ran.
- **Fix:** Check `pg_constraint` for `payment_logs_upi_txn_unique` first, `ADD CONSTRAINT` only if missing. Re-ran `node migrate.js` via SSH → `🎉 Database Migration Successful!`, seed → `SEED_DONE`, all 6 variants verified.
- **Preventive Action:** Never use `IF NOT EXISTS` on `ADD CONSTRAINT`; always guard via `pg_constraint` lookup. Syntax-check migrate paths that run before seed.

---

## [2026-09-08] WhatsApp Token Leaked Into Railway Logs
- **Symptoms:** `railway logs` output contained full axios error dump including `Authorization: Bearer EAA...` (user pasted it into chat).
- **Root Cause:** `logger.js logError` printed the raw error object; axios errors embed `config.headers`. `webhook.js` also logged the full incoming body.
- **Fix:** Sanitized `logError` (strips auth/token/secret/key headers, logs only message/url/status/response data); webhook logs only `{from,type,id}`. Rotated `WHATSAPP_ACCESS_TOKEN` via new System User token.
- **Preventive Action:** Never `console.error` raw axios errors; treat headers as secrets everywhere.

---

## [2026-07-19] Webhook Concurrency Lock Leak
- **Symptoms:** Customers sending unsupported media formats (such as WhatsApp stickers) caused all subsequent texts (like `"Hi"`) to get locked out indefinitely with `[CONCURRENCY LOCK] Request is already in progress`.
- **Root Cause:** Early returns handling invalid formats bypassed the try-finally lock release code, leaving phone numbers locked in the in-memory `activeUserLocks` set.
- **Fix:** Restructured the main route function to place the try-finally lock acquisition/cleanup block at the very entry point, encompassing early format checks and returns.
- **Preventive Action:** Always scope in-memory lock releases inside wrapper `finally` blocks.
