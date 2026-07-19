# Developer Agent Brief: Mera Kirana

This document guides developer and coding agents on code styling, directory layouts, and execution workflows.

---

## 1. Scope of Responsibility
- Implementing bot state machines, natural language filters, database models, and API controllers.
- Engineering Next.js frontends, state hooks, and component stylings.
- Enforcing security policies (JWT Bearer authorizations, bcrypt encryptions).
- Validating modifications using integration assertions.

---

## 2. Standing Directives

### Code Graph and Dependency Analysis
- **Tooling Preference:** Default to `CodeGraph` as the primary, always-on tool for structural or dependency queries during execution (auto-syncs on file changes).
- **Supplemental Tooling:** Run `Graphify` on-demand (do not run both for the same query to save token spend) when non-code assets (docs, PDFs) need mapping, or when exporting human-readable `GRAPH_REPORT.md` summaries.

### Git Practices
- Make atomic, descriptive git commits as you go — one logical change per commit.
- Reference the corresponding progress log entry in the commit message so that code diffs match operational reasoning (e.g. `feat: implement OTP verification (docs/progress-log.md)`).

---

## 3. Tech Stack & Directory Mappings
- **Express Backend:** `/server` (running on Node.js, database connections managed via node-postgres in `db.js`).
- **Next.js Dashboard:** `/admin-dashboard` (Next.js App Router, using Tailwind CSS and Axios API configurations).
- **PostgreSQL Schema:** `/server/database/schema.sql`.

---

## 4. Verification Procedures
- Never merge code that is untested. Verify modifications by running the local integration flow:
  `node verify_webhook_flows.js` inside `/server` directory.
- Ensure `npm run build` compiles with zero errors before reporting features as complete.
