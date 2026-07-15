# Detailed Step-by-Step Setup & Deployment Guide

This guide will walk you through setting up Meta Developer portal, WhatsApp Commerce Catalog, and Railway deployment step-by-step.

---

## Phase 1: Meta Developer & WhatsApp API Setup

### Step 1: Create a Meta Developer App
1. Open your browser and go to [Meta for Developers](https://developers.facebook.com/).
2. Log in with your Facebook account.
3. Click on the **My Apps** button in the top right menu.
4. Click the green **Create App** button.
5. Under "What do you want your app to do?", select **Other** and click **Next**.
6. Select **Business** as the app type and click **Next**.
7. Provide an **App friendly name** (e.g., `Mera Kirana Bot`).
8. Select your **Business Account** in the dropdown if you have one, or leave it default, then click **Create App** (you may need to re-type your Facebook password).

### Step 2: Add WhatsApp Product to your App
1. You will be taken to the App Dashboard. Scroll down to find the **WhatsApp** product.
2. Click the **Set up** button on the WhatsApp card.
3. Select your Business Account (if not already linked) and click **Continue** (this generates your temporary credentials).

### Step 3: Get Your Phone Number ID and Generate a Permanent Access Token
1. **Get Phone Number ID:**
   - In the left-hand sidebar, navigate to **WhatsApp** -> **API Setup**.
   - Under **Step 1: Select phone numbers**, copy the **Phone number ID** (e.g. `871709562699676`).
   - Open your `server/.env` file and replace `WHATSAPP_PHONE_ID` with this ID.

2. **Generate a Permanent Access Token:**
   *Note: The temporary token shown on the API Setup screen expires in 24 hours. Follow these steps to get a permanent token:*
   - Go to [Meta Business Settings](https://business.facebook.com/settings).
   - In the left sidebar, click **Users** -> **System Users**.
   - Click the blue **Add** button.
   - Enter a system username (e.g., `MeraKiranaSystemUser`), select **Admin** as the system user role, and click **Create System User**.
   - In the system user panel, click **Assign Assets**.
   - Under asset type, select **Apps**, select your app (e.g. `Mera Kirana Bot`), toggle **Full Control / Manage App** on, and click **Save Changes**.
   - In the same system user panel, click **Generate New Token**.
   - Select your app in the dropdown.
   - Under **Token expiration**, select **Never** (or the maximum allowed).
   - Scroll down to permissions, check **whatsapp_business_messaging** and **whatsapp_business_management**.
   - Click **Generate Token**.
   - Copy this permanent token immediately (it will not be shown again).
   - In your `server/.env` file, look for `# WHATSAPP_ACCESS_TOKEN=...`, uncomment it (remove the `#` symbol), and paste your token:
     ```env
     WHATSAPP_ACCESS_TOKEN=your_copied_permanent_token_here
     ```

---

## Phase 2: Create & Link Meta Commerce Catalog

To show products natively inside WhatsApp, you must create a Meta Catalog and link it to your WhatsApp Business Account.

### Step 1: Create the Commerce Catalog
1. Go to the [Meta Commerce Manager](https://commerce.facebook.com/).
2. Log in and select your Business Account.
3. Click **Add Catalog**.
4. Select **E-commerce** and click **Next**.
5. Choose **Upload Product Info**, set the Catalog Owner to your Business Account, name it (e.g., `Dairy Shop Catalog`), and click **Create**.
6. Click **View Catalog** to enter your new catalog.

### Step 2: Add Dairy Products
1. Inside Commerce Manager, go to **Catalog** -> **Items** in the left sidebar.
2. Click **Add Items** in the top right, select **Add Manually**.
3. Fill in product details:
   - **Image:** Upload a clear photo of your dairy product (e.g. Milk packet).
   - **Title:** The product name (e.g. `Cow Milk 500ml`).
   - **Description:** Details (e.g. `Fresh cow milk pasteurized`).
   - **Website Link:** (Put your website domain, or if you don't have one, you can put a placeholder link like `https://example.com`).
   - **Price:** Enter the price (INR).
4. Click **Finish** to add the item. Repeat this for Curd, Paneer, etc.
5. In the Catalog left sidebar, click **Catalog** -> **Sets** to group items if needed.

### Step 3: Link Catalog to your WhatsApp Number
1. In the Commerce Manager left sidebar, click **Settings** (gear icon at the bottom).
2. Go to **Business Assets**.
3. Under **WhatsApp Business Accounts**, select your WhatsApp number.
4. Click **Link Catalog** or **Manage Catalogs**, choose your newly created catalog, and click **Save**.
5. Copy the **Catalog ID** shown in the Catalog settings (or from the URL bar of your browser).
6. Open your `server/.env` file and set `WHATSAPP_CATALOG_ID` to this ID.

---

## Phase 3: Deploy Database & Server on Railway

We will create a PostgreSQL database and host the backend Express server on Railway.

### Step 1: Provision Postgres on Railway
1. Go to [Railway.app](https://railway.app) and sign up/log in.
2. Click the **+ New Project** button in the top right.
3. Select **Provision PostgreSQL** from the dropdown menu. Railway will create a new canvas and spin up your Postgres database.
4. Click on the **Postgres** green box inside the canvas.
5. Go to the **Variables** tab and copy these generated credentials:
   - `PGHOST` (Host)
   - `PGPORT` (Port)
   - `PGUSER` (Username)
   - `PGPASSWORD` (Password)
   - `PGDATABASE` (Database name)

### Step 2: Run Database Setup Script
1. Connect to your database using a PostgreSQL GUI client (like DBeaver or PgAdmin) or you can update the `.env` variables locally with your Railway database parameters:
   - `DB_HOST=<copy host>`
   - `DB_PORT=<copy port>`
   - `DB_USER=<copy username>`
   - `DB_PASSWORD=<copy password>`
   - `DB_NAME=<copy database>`
2. Execute the queries inside the file `server/database/schema.sql` on the Railway Postgres database to create the required tables. You can also run the local DB connection checker:
   ```bash
   node server/check_db.js
   ```
   If it prints: `✅ Found Tables: [addresses, conversation_logs, customers, ...]` your database setup is fully operational.

### Step 3: Deploy the Express Backend Server
1. In Railway, click **+ New** (or **Add Service**) on your canvas.
2. Select **GitHub Repo** (link your GitHub account if not already done) and select your `whatsappbot` repository.
3. Once the service is added, click on it, go to the **Variables** tab, and click **New Variable** / **Bulk Import** to copy all variables from your local `server/.env` file:
   - `PORT=3000`
   - `DB_USER`
   - `DB_HOST`
   - `DB_NAME`
   - `DB_PASSWORD`
   - `DB_PORT`
   - `WHATSAPP_PHONE_ID`
   - `WHATSAPP_ACCESS_TOKEN`
   - `WHATSAPP_VERIFY_TOKEN` (e.g. `merakirana123`)
   - `WHATSAPP_CATALOG_ID`
4. Railway will automatically deploy the server.
5. Go to the **Settings** tab of the backend service on Railway, scroll down to **Environment**, and click **Generate Domain**. Copy the generated public domain URL (e.g. `https://server-production-xxxx.up.railway.app`).

---

## Phase 4: Configure Webhook on Meta Dashboard

Meta needs to know where to send incoming WhatsApp messages from customers.

1. Go back to your [Meta for Developers](https://developers.facebook.com/) app dashboard.
2. In the left-hand menu, navigate to **WhatsApp** -> **Configuration**.
3. Under **Webhook**, click the **Edit** button.
4. Fill in the fields:
   - **Callback URL:** Paste your Railway public domain URL, appending `/api/webhook/whatsapp` at the end (e.g., `https://server-production-xxxx.up.railway.app/api/webhook/whatsapp`).
   - **Verify Token:** Type your chosen verify token (e.g. `merakirana123`).
5. Click **Verify and Save**.
6. Under **Webhook Fields**, scroll down to find **messages** and click the **Subscribe** button on its right side.

---

## Phase 5: Test the Bot
1. Go to your personal WhatsApp app.
2. Send the message `"Hi"` or `"Hello"` to your WhatsApp Business phone number.
3. The bot should instantly reply: *"Welcome to Mera Kirana! Choose an option to start..."* with the buttons to View Products, My Orders, etc.
