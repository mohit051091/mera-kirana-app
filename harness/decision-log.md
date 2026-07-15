# Discovery Decision Log

## [2026-07-15] PostgreSQL Over MongoDB
- **Decision:** Use PostgreSQL as the primary store.
- **Rationale:** Transactional requirements for e-commerce, structure mapping, and preservation of the existing `schema.sql` code.

## [2026-07-15] Railway Hosting
- **Decision:** Host both server, database, and admin panel on Railway.
- **Rationale:** Aligns with user's preference and simplifies dev/deploy loops.
