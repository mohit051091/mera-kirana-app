Harness Version: 1.0
Generated On: 2026-07-15
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
> Before doing any work, read `docs/CURRENT_STATE.md` first — it's the fastest way to know exactly where this project stands. Then read `harness/spec.md` in full, read every file under `harness/skills/` if that folder exists, and skim `harness/decision-log.md`, `harness/assumptions.md`, and `harness/risks.md` if present. Follow the guardrails and failure-handling rules in `harness/spec.md` at all times.

### Keep Docs Updated
> [!IMPORTANT]
> After completing any meaningful subtask — not only at the end of a session — update `docs/CURRENT_STATE.md` to reflect what's actually true right now, including the exact next step if you're mid-task. Also append a line to `docs/PROJECT_TIMELINE.md` (or progress log). Do this before, not after, you risk running out of context or quota — a session can end at any point without warning, and `docs/CURRENT_STATE.md` is what lets a different LLM resume cleanly. Log any non-trivial decision to `docs/DECISION_LOG.md` (or decisions log) as you make it.

### Git Commits
Make atomic, descriptive git commits as you go — one logical change per commit, not one giant commit at the end. When you commit something that corresponds to a progress entry, mention that in the commit message so the two can be cross-referenced later. Git gives you the mechanical diff of what changed; the timeline gives you the why — keep both, don't let one substitute for the other.

### Log Friction
If a skill is missing, a default in the spec turns out wrong, or a task takes noticeably more effort than expected, append a short note to `harness/execution-notes.md` (create it if absent) — one line, what happened, why. This costs you almost nothing and makes future harnesses better.

---

## 3. Guardrails
- **CRITICAL:** Never commit private WhatsApp access tokens or database passwords directly to the repository or logs. Use environmental variables instead.
- Do not run `DROP TABLE` operations on order/customer database tables in production without an verified backup.

---

## 4. Tech Stack & Directories
- **Backend:** Node.js Express (located in `/server`)
- **Frontend:** Next.js React (located in `/admin-dashboard`)
- **Database:** PostgreSQL (schema script in `/server/database/schema.sql`)
- **Asset/Data Folder:** `/server/database`
