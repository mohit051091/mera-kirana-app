# Implementation Plan: Mera Kirana 10/10 Grade Roadmap & Harness Alignment

We will align the project documentation with the updated `discover.md` spec, implement the quick fixes raised by Claude (error logging, human handoff, and cart item removals), and map out the remaining 10/10 phases.

---

## User Review Required

> [!IMPORTANT]
> **Sarvam Saaras v3 API Key**: The user will need to provide the `SARVAM_API_KEY` in the server's `.env` configuration file once Phase 1 begins.
> **Configurable Voice Limits**: Shop owners can now configure their own hourly and daily voice note limits directly from the settings panel (saved in the database), preventing runaway billing costs.

---

## Quick Fixes (Immediate Execution)

### 1. Centralized Error Logger
- **Action**: Create a helper `logger.js` in the server to write error stack traces to a persistent `server/logs/error.log` file on disk. Use this helper across webhook and API routes.

### 2. WhatsApp Human Handoff ("Talk to Owner")
- **Action**: Add trigger `"TALK TO OWNER"` and button `btn_talk_to_owner` that sets the customer session stage to `'HUMAN_HANDOFF'` and alerts the owner. While in `'HUMAN_HANDOFF'`, all incoming messages are ignored by the bot, allowing manual support, until the customer texts `"START"` to resume automation.

### 3. Conversational Cart Item Removals
- **Action**: When displaying the cart, index items (e.g. `[1]`, `[2]`). If the customer texts `"REMOVE <number>"`, delete the matching variant from `cart_items` and show the updated cart list.

---

## Proposed Changes

### Component 1: Harness & Docs Realignment (`discover.md` Compliance) - [COMPLETED]
The root configurations file `AGENTS.md`, role briefs (`developer`, `marketing`, `operations`), and lowercase continuity `/docs` files are fully updated, verified, and pushed to the remote repository.

---

### Component 2: Phase 1 — Sarvam Saaras Voice & Costing Controls
Incorporate Sarvam Saaras-Speech v3 API and implement strict constraints to prevent billing leaks and spam abuse.

#### [MODIFY] [webhook.js](file:///c:/Users/MOHIT/.gemini/antigravity/playground/whatsappbot/server/src/routes/webhook.js)
- **Voice Transcription Integration**: If `SARVAM_API_KEY` is present, process incoming `.ogg` audio files using the Sarvam Saaras-Speech v3 transcription API. Maintain Gemini 2.5 Flash as a fallback translator if Sarvam is down or returns errors.
- **Duration Constraint Check**: Inspect the audio file duration payload from the WhatsApp webhook before sending it to STT. If the voice note exceeds **30 seconds** (matches Sarvam REST API limit), reject processing and alert the customer: *"⚠️ Voice note too long — please keep it under 30 seconds, just list your items."*
- **Configurable Rate-Limit checks per user**: 
  - Look up the `voice_rate_limit_hourly` (default 3) and `voice_rate_limit_daily` (default 10) variables from `system_settings`.
  - Track voice note usage counts in the database per customer. If a customer exceeds these thresholds, block further voice processing and prompt manual selection: *"⚠️ You've hit your order limit for now — try again in an hour."*
- **Dedup identical rapid-fire sends**: Compare the incoming `media_id` or audio file size/hash against the last processed transaction to prevent duplicate dispatches on flaky connections.
- **Two-Step Parse Architecture**:
  - **Step 1**: STT -> Raw Transcript (Hinglish/Marathi speech translated to text).
  - **Step 2**: Use Gemini/Claude with strict function-calling schemas to parse the text into structured item arrays.
- **Deterministic backend validation**:
  - Translate Hinglish terms using a local mapping dictionary (e.g. `pyaaz` -> onion, `dahi` -> curd, `ghee` -> ghee, `atta` -> flour).
  - Normalize units (`kilo`, `kg`, `kilos`, `liter`, `packet`, `किलो`) to standard catalog forms.

#### [MODIFY] [settings.js](file:///c:/Users/MOHIT/.gemini/antigravity/playground/whatsappbot/server/src/routes/settings.js) & [products.js](file:///c:/Users/MOHIT/.gemini/antigravity/playground/whatsappbot/server/src/routes/products.js)
- **Dynamic Price Markups**: Add a configurable `voice_cost_markup` percentage (e.g. 2% value) in the dashboard settings panel.
- **Rate Limit Fields**: Add `voice_rate_limit_hourly` and `voice_rate_limit_daily` settings to the admin dashboard Settings page.
- **Auto-Calculated Margins**: Update product and variant pricing lists on client checkouts to dynamically add this percentage markup on catalog variants to offset non-converting voice processing costs.

---

### Component 3: Phase 2 — Vernacular Multi-Language Bot (Hindi & Marathi)
Expand the WhatsApp bot's reach to native dialect consumers.

#### [MODIFY] [schema.sql](file:///c:/Users/MOHIT/.gemini/antigravity/playground/whatsappbot/server/src/database/schema.sql)
Add a SQL migration adding `language VARCHAR(5) DEFAULT 'EN'` to the `customers` table.

#### [MODIFY] [webhook.js](file:///c:/Users/MOHIT/.gemini/antigravity/playground/whatsappbot/server/src/routes/webhook.js)
- **Language Selection**: Add a greeting routing check. If the customer messages `"HINDI"`, `"MARATHI"`, or `"ENGLISH"`, update their preferred language in the database.
- **Translated Templates**: Store multi-language dictionaries for all core response cards:
  - Welcome greetings (Hindi: *"मेरा किराना में आपका स्वागत है!"*, Marathi: *"मेरा किराना मध्ये आपले स्वागत आहे!"*)
  - Cart views, Checkout buttons, delivery slot options, and payment confirmations.
- **AI Translation Translation Prompt**: Update the Gemini fallback prompt instructing the model to auto-translate Hindi/Marathi speech transcripts to English query structures matching catalog terms.

---

### Component 4: Phase 3 — Subscription Management UI
Dairy delivery models rely heavily on repeating delivery schedules.

#### [NEW] [subscriptions.js (API router)](file:///c:/Users/MOHIT/.gemini/antigravity/playground/whatsappbot/server/src/routes/subscriptions.js)
Create CRUD endpoints `/api/subscriptions`:
- `GET /`: Retrieve all active subscriptions, filtered by status (Active, Paused, Cancelled).
- `PUT /:id/status`: Let managers modify active schedules (e.g., change from "Daily" to "Alternate Days" or "Weekly"), pause schedules, or cancel them.

#### [NEW] [page.js (subscriptions dashboard)](file:///c:/Users/MOHIT/.gemini/antigravity/playground/whatsappbot/admin-dashboard/app/subscriptions/page.js)
Build a dashboard panel displaying customer details, active repeating variants, quantity settings, and delivery calendars. Wire modal cards to trigger status edits or deactivations.

#### [MODIFY] [webhook.js](file:///c:/Users/MOHIT/.gemini/antigravity/playground/whatsappbot/server/src/routes/webhook.js)
- **WhatsApp Customer Subscription Interface**:
  - Add a quick reply button **"📅 Subscriptions"** (triggers payload `btn_view_subscriptions`) to the bot's greeting template.
  - When triggered, query active subscriptions for the customer and return a structured summary card:
    *“📅 *Your Subscriptions:*\n\n1. Cow Milk (500ml) x 2 [Daily] - Status: *Active*\n2. Paneer (200g) x 1 [Weekly] - Status: *Paused*\n\nSelect an option to manage your delivery schedule:”*
  - Deliver dynamic button triggers alongside the summary:
    - `btn_sub_pause_<id>`: Pauses the subscription, scheduling a notification confirmation: *"⏸️ Delivery schedule paused. You can resume at any time!"*
    - `btn_sub_resume_<id>`: Restores paused deliveries.
    - `btn_sub_cancel_<id>`: Cancels the repeating order.
    - `btn_sub_new`: Initiates a subscription booking. Prompts the customer to select a catalog product and choose frequency (`Daily`, `Alternate Days`, `Weekly`).

---

### Component 5: Phase 4 — Multi-Tenant Architecture (Multiple Shops)
Scale the codebase to host multiple independent kirana merchants.

#### [MODIFY] [schema.sql](file:///c:/Users/MOHIT/.gemini/antigravity/playground/whatsappbot/server/src/database/schema.sql)
- **Shared DB Schema with Tenant Isolation**:
  - **Create `shops` Table**:
    * `shop_id` (UUID, Primary Key)
    * `name` (e.g., "Krishna Dairy")
    * `whatsapp_phone_number` (maps incoming webhook payloads to matching shop)
    * `upi_vpa` (merchant's dynamic settlement address)
    * `is_active` (boolean billing status)
  - **Add `shop_id` Columns (Foreign Key)**:
    * Add `shop_id REFERENCES shops(shop_id)` to `products`, `orders`, `customers`, and `system_settings` tables.
    * This allows multiple shops to share a single cost-effective PostgreSQL database instance with complete logical isolation.

#### [MODIFY] [server.js](file:///c:/Users/MOHIT/.gemini/antigravity/playground/whatsappbot/server/src/server.js) & Backend Routers
- **Tenant Scope Middleware**: Extract `shop_id` from route parameters or request headers (e.g., `/api/:shop_id/orders`), appending the discriminator value to all SQL queries automatically.
- **Webhook Routing**: Inspect the WhatsApp Business Account ID or phone recipient ID in the webhook payload, query the matching `shop_id` from the `shops` table, and scope the customer session under that tenant.

#### [NEW] [page.js (super-admin panel)](file:///c:/Users/MOHIT/.gemini/antigravity/playground/whatsappbot/admin-dashboard/app/super-admin/page.js)
Build a Super-Admin onboarding console to register new shops, configure WhatsApp API tokens, set SaaS subscription fee tiers, and review monthly P&L charts.

---

### Component 6: Phase 5 — Open Network Commerce (ONDC Integration)
Expose inventories and handle network deliveries.

#### [NEW] [ondc.js (API Router)](file:///c:/Users/MOHIT/.gemini/antigravity/playground/whatsappbot/server/src/routes/ondc.js)
Expose standard public lookup routes for the ONDC protocol:
- `GET /ondc/catalog`: Exports stock listings as standard ONDC catalog JSON payloads.
- `POST /ondc/webhook`: Handles incoming search, select, init, and confirm requests to place network orders.
- Wire status logs changes in `/orders` to automatically post status callbacks (Preparing -> Out for Delivery -> Delivered) back to ONDC buyer apps.

---

## Verification Plan

### Automated Tests
We will expand `verify_webhook_flows.js` to execute:
- Voice note length validation (Test sending 40s audio clip -> expect 30s rejection).
- Voice note frequency count spam check (Test sending 11 sequential notes -> expect 11th blocked).
- Language toggles checks (Verify HINDI command updates language state in DB and returns translated text).
- API Token verification on `/api/subscriptions` routes.
- Webhook tenant lookup matching logic verification.

### Manual Verification
- Testing Sarvam audio translation quality and response latency.
- Navigating the new Subscriptions and Super-Admin pages in the Next.js admin dashboard to verify state changes.
