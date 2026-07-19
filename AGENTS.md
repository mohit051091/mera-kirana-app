Harness Version: 1.0
Generated On: 2026-07-19
Specification: harness/spec.md

# Project OS Instructions: Mera Kirana Bot & Admin Panel

This file details instructions, standards, and rules for coding and execution agents working on this project.

---

## 1. Project Summary
Mera Kirana is an automated e-commerce solution designed for a local dairy shop. It enables customers to browse a native dairy product catalog, manage a shopping cart, and place orders directly through a WhatsApp Business chatbot. A Next.js-based web admin panel lets store managers view orders, configure inventory, and oversee delivery partner statuses.

---

## 2. Operational Directives

### Read Current State First
> [!IMPORTANT]
> Before doing any work, read docs/current-state.md first — it's the fastest way to know exactly where this project stands. Then skim docs/tasks.md so you know what's queued, not just what's active. Then read harness/spec.md in full. Then find your role in the list below and read your own brief — you do not need to read every other role's brief, only your own and this shared section.

### Routing List
- If you are the developer/coding agent, read `harness/roles/developer/BRIEF.md`.
- If you are the marketing/GTM agent, read `harness/roles/marketing/BRIEF.md`.
- If you are the operations agent, read `harness/roles/operations/BRIEF.md`.

### Keep Docs Updated
> [!IMPORTANT]
> After completing any meaningful subtask — not only at the end of a session — update docs/current-state.md to reflect what's actually true right now, including the exact next step if you're mid-task. Also append a line to docs/progress-log.md. Do this before, not after, you risk running out of context or quota — a session can end at any point without warning, and docs/current-state.md is what lets a different LLM resume cleanly. Log any non-trivial decision to docs/decisions.md as you make it.

### Update Registries On Trigger
> [!IMPORTANT]
> Update docs/tasks.md whenever a task's status actually changes — not just at session end. When you fix a real bug (not a typo, an actual defect that caused wrong behavior), record it in docs/incidents.md with symptoms, root cause, fix, and how to prevent recurrence. When you try an approach and abandon it, record it in docs/rejected-approaches.md with why — this stops a future session from re-proposing it. If this project deploys anywhere, log every deployment in docs/deployments.md before or immediately after it happens. If performance work happens, log it in docs/performance-log.md with baseline and result, not just the change.

### Log Friction
If a skill is missing, a default in the spec turns out wrong, or a task takes noticeably more effort than expected, append a short note to harness/execution-notes.md (create it if absent) — one line, what happened, why. This costs you almost nothing and makes future harnesses better.

---

## 3. Standing Guardrails

- **CRITICAL:** Never commit private WhatsApp access tokens or database passwords directly to the repository or logs. Use environmental variables instead.
- Do not run `DROP TABLE` operations on order/customer database tables in production without an verified backup.
- **AUTH POLICY:** Never implement authentication that can be bypassed purely client-side (e.g. a flag checked only in browser JS or a cookie set without server verification) for anything touching real user data, payments, or admin access. Enforce auth server-side on every protected endpoint. This applies unless the user has explicitly confirmed this is a disposable prototype that will never be exposed to real traffic.
- **DEFINITION OF DONE:** A feature is only complete when it is wired end-to-end and actually exercised by the running application. A database table, column, or UI element that exists but is never read, written, or invoked by real application code is NOT a completed feature — do not report it as done in docs/progress-log.md or docs/current-state.md just because it exists in the schema or interface.

---

## 4. Tech Stack & Directories
- **Backend:** Node.js Express (located in `/server`)
- **Frontend:** Next.js React (located in `/admin-dashboard`)
- **Database:** PostgreSQL (schema script in `/server/database/schema.sql`)
- **Asset/Data Folder:** `/server/database`
