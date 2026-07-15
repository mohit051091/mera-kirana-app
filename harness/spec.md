# Harness Specification: Mera Kirana

This document defines how the AI development team and execution agents should behave when working on the Mera Kirana chatbot and admin system.

---

## Part 1: Project Details

### 1. Objective
- **Goal:** Build an automated dairy shop e-commerce flow using a WhatsApp Business chatbot for native catalog browsing, cart additions, checkout, payment mode selection, and order tracking, backed by a Next.js admin dashboard to manage inventory and monitor fulfillment.
- **Failures to Avoid:** Duplicate message responses from webhook, database crashes on status changes, 404 page errors on admin layout, database schema out-of-sync with queries.

### 2. Users / Consumers
- **Customers:** Dairy shop patrons who place orders via WhatsApp chat.
- **Admin/Staff:** Shop managers who use the Next.js admin interface to review orders and update status.
- **Riders/Partners:** Delivery staff who receive order assignments and update their availability.

### 3. Domain Shape
- **Codebase:** Full-stack JavaScript application containing an Express API backend and Next.js frontend web app.

### 4. Inputs & Outputs
- **Inputs:**
  - WhatsApp messages and user interactive replies (buttons, lists, catalog select, address forms).
  - Admin panel product entries, partner updates.
- **Outputs:**
  - WhatsApp API outgoing payloads (texts, buttons, catalogs, status reads).
  - Web UI views for orders and products.

### 5. Functional Requirements
- **WhatsApp Webhook:** Handle user greetings, show interactive catalog, handle variant selection, store user address, present payment options (UPI, COD), and confirm orders.
- **Deduplication:** Ensure incoming messages with the same `message_id` are only processed once.
- **Admin Dashboard:** Display store metrics, show live orders, list products and variants, allow new product creation, and manage delivery partner availability.

### 6. Non-Functional Requirements
- **Accuracy:** Zero duplicate responses to customers.
- **Hosting cost:** Fit within standard Railway free/developer tier resource limits.
- **Response latency:** Chatbot responses sent in under 2 seconds.

### 7. Tech Stack & Constraints
- **Backend:** Node.js, Express (v5.2)
- **Frontend:** Next.js (App Router, Tailwind CSS, Lucide icons, Axios)
- **Database:** PostgreSQL (hosted on Railway)
- **APIs:** Meta WhatsApp Cloud API (v17.0)

### 8. Repeatable Steps vs. Judgment Calls
- **Repeatable Steps (Automated):** Database setup, linting, testing, next.js dev build runs.
- **Judgment Calls (Human):** Product design choices, UI branding color adjustments, final Meta app verification.

### 9. Agent Roles
- **Orchestrator:** Manages feature breakdowns and updates progress.
- **Coder:** Modifies files and runs tests.
- **Validator:** Verifies features manually and checks system performance.

### 10. Memory Strategy
- Database state in PostgreSQL is the single source of truth for sessions and active orders.

### 11. Tools & External Access
- PostgreSQL database access via node-postgres.
- Outbound HTTPS traffic to `graph.facebook.com` for WhatsApp API calls.

### 12. Verification / Evaluation
- Validate DB schema using test SQL queries.
- Build Next.js dashboard locally to verify no compile-time errors.
- Test endpoint health check returns status OK.

### 13. Failure Handling
- Log errors in Express routes and output friendly user warning messages on WhatsApp (e.g. "Something went wrong, please try again").
- If the agent gets stuck, log details to `harness/execution-notes.md`.

### 14. Guardrails
- **CRITICAL:** Never leak WhatsApp access tokens or database passwords in commit logs.
- Never delete customer order tables in production without backups.

### 15. Success Metrics
- Fully functional, error-free Next.js layout (no 404 pages on clicking navigation links).
- Zero database constraint crashes during bot operations or status changes.

### 16. Risks & Assumptions
- **Assumption:** Meta Developer App is set up and configured by user (default, not confirmed).
- **Risk:** Meta App access tokens might expire, requiring manual token refreshes by the user.

---

## Part 2: Harness Design

*Note: All items below are set as project defaults since the user has requested the AI team to proceed autonomously.*

- **Topology:** Hierarchical (one orchestrator agent delegating specialized tasks to code/test agents).
- **Autonomy Level:** High. The agent can modify, test, and write codebase files freely. Pause for user approval only when updating production API secrets or final hosting details.
- **Parallelization:** Sequential code changes to avoid lock contentions.
- **Context Access:** All agent roles see the full codebase.
- **Memory Sharing:** Shared project memory via `/docs` and `AGENTS.md`.
- **Conflict Resolution:** Reviewer/Critic agent decides, with final escalations to the user.
- **Cost & Latency Budget:** Use cheapest/fastest models (Gemini Flash) for routine code writing and styling; prioritize accuracy for database schema edits.
- **Model Assignment per Role:** 
  - Orchestration & Review: Gemini 3.5 Pro (default, not confirmed).
  - Code Writing & Execution: Gemini 3.5 Flash (default, not confirmed).

---

## Open Questions
- None currently.
