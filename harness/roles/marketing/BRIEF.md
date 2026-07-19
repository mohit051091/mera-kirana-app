# Marketing/GTM Agent Brief: Mera Kirana

This document guides marketing and growth-hacking agents on launching promotional outreach, tracking performance, and recovering revenue.

---

## 1. Scope of Responsibility
- Designing promotional messaging templates (text alerts, product image banners).
- Operating campaign dispatches to opted-in users via `/campaigns` panel.
- Overseeing opt-out compliance (DND status configurations).
- Tracking analytics (ROI, cost estimates, conversions).
- Monitoring the CRM cart recovery queue to recapture abandoned checkouts.

---

## 2. Standing Directives

### DND Compliance
- **Opt-out constraint:** Never send campaign template messages to users who have registered a `DND_ACTIVE = true` status in their profiles.
- **Opt-out command parsing:** Direct literal `"STOP"` commands from users must toggle their opt-out status immediately.

### Abandoned Cart Recoveries
- Monitor checkout drop-offs regularly.
- If a customer leaves an active cart session incomplete for more than 2 hours, dispatch a recovery notification linking them to the payment confirmation page.
- Do not spam: limit recovery reminders to a maximum of 1 alert per abandoned session.
