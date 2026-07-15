# Discovery Risks & Mitigations

1. **Meta API Versioning / Key Expiration:**
   - *Risk:* WhatsApp Access Tokens expire, causing bot messaging to fail.
   - *Mitigation:* Document step-by-step how to get a Permanent Access Token in the meta app settings.
2. **Postgres Connection Latency:**
   - *Risk:* Queries from Express backend to Railway DB fail due to network timeouts.
   - *Mitigation:* Ensure `pg` Pool handles error events gracefully and has automatic reconnects.
3. **Database Schema Drift:**
   - *Risk:* Code queries database tables that don't exist on Railway database.
   - *Mitigation:* Align local `schema.sql` and run checks inside `check_db.js` before starting the server.
