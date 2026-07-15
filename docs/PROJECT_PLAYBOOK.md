# Project Playbook: Mera Kirana (Dairy Shop WhatsApp Bot & Admin Panel)

## 1. Project Overview
Mera Kirana is an automated e-commerce solution designed for a local dairy shop. It enables customers to browse the dairy product catalog, add items to their cart, and place orders directly through WhatsApp. It also features a web-based Admin Dashboard for the shop owner to manage products, view incoming orders, and manage delivery partners.

### Core Objectives
- **WhatsApp Catalog Integration:** Allow customers to browse a native Meta commerce catalog or an interactive product list in WhatsApp.
- **Automated Ordering Flow:** Seamless ordering from greeting to catalog selection, quantity input, address collection, payment mode selection (UPI or COD), and order confirmation.
- **Admin Dashboard:** Provide a Next.js-based web interface to manage catalog inventory and track orders.
- **Delivery Management:** Simple flow for registering delivery partners and tracking order fulfillment status.

---

## 2. Technical Stack
- **Backend:** Node.js, Express (v5)
- **Frontend:** Next.js (App Router, Tailwind CSS, Lucide Icons, Axios)
- **Database:** PostgreSQL (hosted on Railway)
- **Messaging API:** Meta WhatsApp Cloud API (v17.0)

---

## 3. Key Workflows & Features

### A. WhatsApp Ordering Flow
1. **Initiation:** Customer sends "Hi" / "Menu".
2. **Catalog Browsing:** Bot sends the interactive catalog link or product lists.
3. **Cart Management:** Customer selects products and quantities (managed in backend session/database).
4. **Checkout:** Address collection (using WhatsApp address message type or text fallback).
5. **Payment Method:** Interactive buttons for COD (Cash on Delivery) or UPI.
6. **Order Placement:** Order is written to PostgreSQL with status `CONFIRMED` or `PENDING_PAYMENT`.

### B. Admin Dashboard Flow
1. **Overview:** Daily orders, revenue metrics, active delivery partners.
2. **Inventory Management:** View, add, update products and weight-based variants.
3. **Order Control:** View order queue, update statuses, assign delivery partners.
