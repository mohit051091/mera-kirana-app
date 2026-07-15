# Decision Log

## [2026-07-15] Database Choice: PostgreSQL over MongoDB
- **Decision:** Use PostgreSQL (hosted on Railway) as the primary database instead of MongoDB or Supabase.
- **Reason:** 
  1. **Relational Data:** E-commerce applications deal with highly structured, relational data (Customers -> Addresses, Products -> Variants, Orders -> Order Items). PostgreSQL enforces relational integrity (Foreign Keys) and ensures transactional safety (ACID).
  2. **Code Reuse:** The project already has a `schema.sql` and database connection wrapper (`db.js`) written for PostgreSQL. Changing to MongoDB would require rewriting the entire data access layer.
- **Alternatives:** MongoDB (rejected due to schema structure mismatch and rewrite cost), Supabase (rejected per user's request to use Railway).
- **Trade-offs:** MongoDB allows faster schema changes for loose payloads, but Postgres offers stronger guarantees for inventory tracking and order transactions.
- **Status:** Approved.

---

## [2026-07-15] Hosting Platform: Railway
- **Decision:** Host both the Express backend, PostgreSQL database, and Next.js frontend on Railway.
- **Reason:** 
  1. Simplifies deployment and environment variable sharing under one project.
  2. The user has an existing workflow/preference for Railway and wants to move away from Supabase.
- **Status:** Approved.
