# Decision Log

## [2026-07-15] Database Choice: PostgreSQL over MongoDB
- **Decision:** Use PostgreSQL (hosted on Railway) as the primary database instead of MongoDB.
- **Reason:** 
  1. **Relational Data:** E-commerce applications deal with highly structured, relational data (Customers -> Addresses, Products -> Variants, Orders -> Order Items). PostgreSQL enforces relational integrity (Foreign Keys) and ensures transactional safety (ACID).
  2. **Code Reuse:** The project already has a `schema.sql` and database connection wrapper (`db.js`) written for PostgreSQL. Changing to MongoDB would require rewriting the entire data access layer.
- **Alternatives:** MongoDB (rejected due to schema structure mismatch and rewrite cost).
- **Trade-offs:** MongoDB allows faster schema changes for loose payloads, but Postgres offers stronger guarantees for inventory tracking and order transactions.
- **Status:** Approved.

---

## [2026-07-15] Hosting Platform: Railway
- **Decision:** Host both the Express backend, PostgreSQL database, and Next.js frontend on Railway.
- **Reason:** 
  1. Simplifies deployment and environment variable sharing under one project.
  2. The user has an existing workflow/preference for Railway.
- **Status:** Approved.

---

## [2026-07-18] Serviceable Pincodes: Master List Toggles
- **Decision:** Added `is_allowed` boolean flag column to the `pincode_master` table instead of deleting/inserting rows from the CSV raw database directly on settings changes.
- **Reason:** Keep all 19,000+ Indian postal office mappings intact in PostgreSQL to power instant smart search suggestions as the owner types, while allowing simple boolean toggles to add or remove active pill tags.
- **Status:** Approved.

---

## [2026-07-18] Admin Dashboard Security: Cookie Auth Middleware
- **Decision:** Secured frontend Next.js pages using Edge Middleware routing, checking for a secure client-side cookie `admin_auth = true`.
- **Reason:** Provides immediate redirect boundary blocking unauthenticated requests to `/settings` or `/products` at the Next.js routing layer, preventing leaks.
- **Status:** Approved.

---

## [2026-07-19] Dashboard Security Upgrade: JWT Bearer Tokens
- **Decision:** Upgraded security to use bcrypt hashed passwords, signed JSON Web Tokens (JWT) on login, and JWT Bearer authorization middleware validation on all private backend routes.
- **Reason:** Replaces hardcoded plaintext password matches with standard cryptographic auth, ensuring zero configuration leakage in network headers.
- **Status:** Approved.

---

## [2026-07-19] Conversational Reordering: State Machine Fast-Track
- **Decision:** Repeat orders copy items and metadata (address snapshot, timing slot) from historical transactions and immediately route the customer to the `CHOOSE_PAYMENT` stage.
- **Reason:** Minimizes customer checkout friction from 5 steps down to 1 click, reusing previous confirmed details.
- **Status:** Approved.

---

## [2026-07-19] Webhook Concurrency Locks: Try-Finally Scoping
- **Decision:** Moved the webhook `try {` block up to encapsulate message parsing, early media validations, and early returns.
- **Reason:** Guarantees that the phone number is always freed from the active memory lock in the `finally` block, preventing permanent lockout scenarios.
- **Status:** Approved.
