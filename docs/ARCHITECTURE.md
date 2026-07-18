# Architecture Blueprint

## 1. System Overview
The application consists of three main blocks:
1. **WhatsApp Chatbot (Express Server):** Listens to webhook events from the Meta API, updates the database, and responds with interactive catalog or button templates.
2. **Admin Dashboard (Next.js):** Provides a visual UI for the shop manager to create products, view orders, and manage delivery partners.
3. **Database (PostgreSQL on Railway):** Stores customers, orders, inventory, and transaction logs.

```mermaid
graph TD
    User([Customer on WhatsApp]) <-->|WhatsApp Messages| MetaAPI[Meta WhatsApp Cloud API]
    MetaAPI <-->|Webhook POST / send API| Backend[Express Server]
    Admin([Shop Admin]) <-->|Web UI| Frontend[Next.js Dashboard]
    Frontend <-->|REST API| Backend
    Backend <-->|SQL Queries| DB[(PostgreSQL Database)]
```

---

## 2. Subsystems

### A. WhatsApp Webhook & Bot Engine
- **Files:** `server/src/routes/webhook.js`, `server/src/services/whatsapp.js`
- **Responsibilities:**
  - Verify webhook challenges (`hub.verify_token`).
  - Receive messages (text, list response, button response, address, catalog).
  - Implement chat logic (cart management, address storing, order finalization).
  - Deduplicate incoming messages using the database to prevent duplicate responses.

### B. Admin API
- **Files:** `server/src/routes/products.js`, `server/src/routes/orders.js`, `server/src/routes/partners.js`, `server/src/routes/settings.js`, `server/src/routes/coupons.js`, `server/src/routes/salespeople.js`, `server/src/routes/analytics.js`
- **Responsibilities:**
  - Expose JSON endpoints for Next.js panel.
  - Handle product and variant updates.
  - Handle order status updates and partner management.
  - Run route optimizations and audit conversation sessions.

### C. Frontend Dashboard
- **Files:** `admin-dashboard/app/`
- **Pages:**
  - `/` (Overview metrics)
  - `/analytics` (Funnel drop-off charts & Chat logs simulator)
  - `/orders` (Checkout checkboxes & Rider dispatch controls)
  - `/products` (Variant updates & Owner margin restrictions)
  - `/coupons` (Discount voucher codes CRUD)
  - `/salespeople` (Referral agent program payouts)
  - `/partners` (Delivery partner status toggles)
  - `/settings` (WhatsApp endpoints, operating hours, allowed pincodes checklist, and merchant UPI VPA)

---

## 3. Location Mapping Architecture (GPS vs. Pincode)
To compute optimal rider delivery routes, the system relies on a two-tier location resolution:
1. **Layer A: Neighborhood-Level Mapping (Pincode Fallback)**
   - When a user enters text/voice addresses, the parser extracts the 6-digit postal pincode.
   - The backend queries `pincode_master` coordinates (`latitude`/`longitude`) to verify serviceability and locate the zone center.
2. **Layer B: Precise GPS Mapping (6-Decimal WhatsApp Coordinates)**
   - When a customer shares their location attachment natively on WhatsApp, the backend captures their exact GPS coordinate values (`message.location.latitude`/`longitude`) and updates the order metadata.

## 4. OSRM Trip Routing Workflow
```mermaid
sequenceDiagram
    participant Admin as Shop Dispatcher
    participant DB as Postgres Database
    participant API as Express Backend
    participant OSRM as OSRM Trip API
    participant Rider as Delivery Rider
    
    Admin->>DB: Query Confirmed Orders for Delivery Slot
    Admin->>API: Select Order IDs & Request Route Optimize
    API->>DB: Fetch coordinate points for order pincodes
    API->>OSRM: GET /trip/v1/driving/{dairy_coords;order1_coords;order2_coords...}
    OSRM-->>API: Return Optimized Visitation Order (TSP Solution)
    API-->>Admin: Show optimized sequence list
    Admin->>Rider: Assign Rider & Open Google Maps Multi-Stop directions link
```

## 5. Data Models (Key Tables)
- **customers:** Stores customer phone numbers and referred salesperson mappings.
- **addresses:** Shipping addresses per customer.
- **products & product_variants:** Weight-based variants (e.g., 500g milk, 1kg curd) with individual prices, cost prices, and stock limits.
- **orders & order_items:** Tracks total amount, order state (PENDING_PAYMENT, CONFIRMED, DELIVERED, etc.), and itemized variants.
- **delivery_partners & order_assignments:** Tracks active riders and availability states.
- **conversation_logs:** Chronological E2E WhatsApp interactions grouped under a persistent `conversation_id` session with active stage tags.
- **dropoffs:** Logs conversion leak funnel drop-offs for analysis.

