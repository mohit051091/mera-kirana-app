# Rejected Approaches Registry

This file records engineering approaches that were tried and abandoned, with explanations of why they failed, to prevent redundant re-implementations.

---

## 1. Cleartext Header-Based Admin Authentication
- **Approach:** Passing and comparing plaintext passwords in custom request headers (`x-admin-password`).
- **Why Abandoned:** Highly insecure. Exposed cleartext passwords in browser cookies, lacked token rotation or session expiration, and did not follow cryptographic standards.
- **Replacement:** Upgraded to standard bcrypt-hashed passwords in the database and signed JSON Web Tokens (JWT) verified on the backend via authorization headers (`Bearer <token>`).

---

## 2. CSV File-Based Pincode Checking
- **Approach:** Parsing the 23MB India post offices CSV dynamically inside webhook routes to check postal serviceability.
- **Why Abandoned:** Caused extremely slow response times (over 5 seconds) and high memory usage, leading to server crashes under load.
- **Replacement:** Created a Postgres index table `pincode_master` and populated it using a one-time pre-seeding script (`seed_pincodes.js`).
