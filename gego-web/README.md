# GEGO website

Public site for **GEGO**, the dental management system previously named DEMSTA. Built with React, Vite, and Tailwind. The visual starting point is the DentCare template in `Gego_website` (HTML Codex / ThemeWagon). The product story follows the clinic system in this repository.

The site opens in Swahili and can be switched to English. Plan prices are in Tanzanian shillings (TSH). GEGO is at Gongo la Mboto, Dar es Salaam, Tanzania.

## Run

```bash
cd gego-web
npm install
npm run dev
```

Open http://127.0.0.1:5174

## Client portal demo

Sign in at `/portal/login`.

| Email | Password |
|---|---|
| clinic@gego.dental | Gego!Clinic1 |

The portal keeps invoices, billing, notifications, support notes, and the clinic profile in this browser only. It does not call the clinic API.

## Pages

Home, services, about, documentation, plans, promotions, appointment booking, book a demo, contact, and the client portal (dashboard, invoices, billing, notifications, support, clinic profile).
