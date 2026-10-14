# CreatorMarket — Marketplace & Creator Tools

A single, fully static frontend that merges two products into one site:

- **Marketplace** — browse, buy and sell digital products (prompts, templates, eBooks, creator tools), with reviews, wishlist, coupons, creator profiles, promotions and a buyer library.
- **Creator Tools** — YouTube video analyzer, Social Content Studio (YouTube / Instagram / Facebook / TikTok) and an AI Prompt Creator.

Everything server-side runs on **Supabase** (Auth + Postgres + Edge Functions).

Payments work two ways: **UPI (direct)** is the default and needs **no account or
gateway** — buyers pay to your own UPI ID by QR / UPI app. **Cashfree** is fully
wired up and can be switched on later once you open a Cashfree account. There is
**no Netlify dependency at all** — no `netlify.toml`, no `/.netlify/functions/*`,
no Netlify Identity.

---

## What changed from the old package

| Before | Now |
| --- | --- |
| Razorpay checkout (`checkout.razorpay.com`) | **UPI direct** (default, no gateway) + **Cashfree** checkout |
| Netlify Functions (`netlify/functions/*.js`) | **Supabase Edge Functions** (`supabase/functions/*`) |
| Netlify Identity login | **Supabase Auth** (email + password) |
| Razorpay subscriptions | One-time **30-day passes** (Creator ₹299 / Pro ₹599) |
| USD product prices | **INR (₹)** throughout |
| Netlify deploy | Static hosting (Supabase / any static host) + Supabase Edge Functions |

---

## Project layout

```
index.html                     The whole site (marketplace + creator tools)
logo.svg                       Brand logo asset
robots.txt / sitemap.xml       SEO files
supabase/
  config.toml                  Edge Function config (JWT verification off; each function self-authenticates)
  migrations/0001_creator_market.sql   Tables, RLS policies and indexes
  functions/
    _shared/cors.ts            Shared CORS + JSON helpers
    create-order/index.ts      Creates a Cashfree order (holds your secret key)
    verify-payment/index.ts    Confirms Cashfree status server-side, marks order paid
    ai-tools/index.ts          Content packs + AI prompt creator (OpenAI)
    analyze/index.ts           YouTube metadata (Data API + oEmbed fallback)
    thumbnail/index.ts         YouTube thumbnail lookup / proxied download
    owner-report/index.ts      Platform-owner summary: sales, commission, payouts
```

---

## Setup

### 1. Database
In the Supabase dashboard → **SQL Editor**, run both migrations in order:
`supabase/migrations/0001_creator_market.sql` then
`supabase/migrations/0002_commission.sql`.
This creates the `products`, `orders`, `promotions`, `reviews`, `wishlists`,
`coupons`, `notifications` and `creator_payouts` tables with Row Level Security,
plus the commission columns on `orders`.

### 2. Edge Function secrets
In **Project Settings → Edge Functions → Secrets** (or `supabase secrets set`),
add these — values are never committed to the repo:

| Secret | What it is |
| --- | --- |
| `CASHFREE_APP_ID` | Cashfree App ID (client id) |
| `CASHFREE_SECRET_KEY` | Cashfree Secret Key |
| `CASHFREE_ENV` | `sandbox` while testing, `production` when live |
| `CASHFREE_RETURN_URL` | (optional) URL Cashfree returns to after checkout |
| `COMMISSION_PERCENT` | Platform commission on each creator sale (e.g. `10`) |
| `CASHFREE_SPLIT_ENABLED` | `true` once Easy Split is activated on your account |
| `OWNER_EMAIL` | Your login email, to read the platform-earnings report |
| `OPENAI_API_KEY` | For Content Studio + AI Prompt Creator |
| `OPENAI_MODEL` | (optional) defaults to `gpt-4o-mini` |
| `YOUTUBE_API_KEY` | (optional) richer YouTube stats; falls back to oEmbed |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided
automatically by the Edge Function runtime.

### 3. Deploy the functions
Install the Supabase CLI, then from this folder:

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase functions deploy create-order
supabase functions deploy verify-payment
supabase functions deploy ai-tools
supabase functions deploy analyze
supabase functions deploy thumbnail
supabase functions deploy owner-report
```

### 4. Point the frontend at your project
Open `index.html` and edit the `CONFIG` block near the top of the script:

```js
const CONFIG = {
  SUPABASE_URL: 'https://<your-project>.supabase.co',
  SUPABASE_KEY: '<your publishable / anon key>',

  // UPI works immediately — put your own UPI ID here:
  UPI_ID: 'yourname@upi',
  UPI_PAYEE_NAME: 'CreatorMarket',

  // Flip to true only after your Cashfree account + secrets are set:
  CASHFREE_ENABLED: false,
  CASHFREE_MODE: 'sandbox', // 'production' when using live Cashfree keys

  FUNCTIONS_BASE: null
};
```

That's it for UPI — as soon as `UPI_ID` is your real UPI ID, the **Pay by UPI**
option is live (QR code + `upi://pay` deep link + copyable UPI ID).

### 5. Host the frontend
Because the backend lives on Supabase, the frontend is a plain static site.
Upload `index.html`, `logo.svg`, `robots.txt` and `sitemap.xml` to any static
host (Supabase Storage, GitHub Pages, Cloudflare Pages, your own server, …).

### 6. Cashfree dashboard
Whitelist the domain you host the site on (Cashfree requires the domain that
opens the checkout to be whitelisted). Configure your webhook URL there too if
you want server-to-server payment notifications.

---

## How a payment flows

### UPI (default, no gateway)
1. Buyer clicks **Buy** → the checkout modal opens with **Pay by UPI**.
2. It shows a **QR code**, the owner's **UPI ID** (copyable) and an
   **Open UPI app** button (`upi://pay?...`) for mobile.
3. The buyer pays from any UPI app; money lands in the owner's bank account.
4. The buyer taps **I have paid — submit order**, which records the order as
   `pending` / “awaiting confirmation”.

Because there is no gateway in the UPI path, the order is **not** auto-verified —
confirm it manually (see the note below).

### Cashfree (when enabled)
1. Buyer clicks **Buy** → the browser calls the `create-order` Edge Function.
2. `create-order` reads the **price from the database** (never trusts the
   browser), creates a Cashfree order with your secret key, saves a `pending`
   row and returns a `payment_session_id`.
3. The Cashfree checkout opens; the buyer pays.
4. The browser calls `verify-payment`, which asks Cashfree for the
   authoritative order status and, only if it is `PAID`, marks the order `paid`.

Secret keys (`CASHFREE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) exist **only**
inside the Edge Functions — never in `index.html`.

---

## Commission (marketplace, 10%)

Each product sale records a **platform commission** (default **10%**, set by
`COMMISSION_PERCENT`) and the **creator payout** (the rest). This is computed
**server-side** in `create-order` — never in the browser.

There are two levels of automation:

1. **Tracking — works now, no gateway.** Every sale stores `commission_amount`
   and `creator_payout` on the order. The owner opens **Creator Dashboard →
   📈 Platform earnings** to see gross sales, commission earned and creator
   payouts owed. The buyer's library shows the split per order.
2. **Automatic settlement — needs Cashfree Easy Split.** With Easy Split
   activated and each creator onboarded as a Cashfree *vendor*, the order is
   created with an order-level split, so Cashfree **auto-settles the creator's
   share to their account and the commission to yours**. Then flip
   `CASHFREE_SPLIT_ENABLED: true` and match `COMMISSION_PERCENT` to your Cashfree
   split scheme.

**UPI cannot do automatic commission** — UPI money all lands in one account, so
you would pay creators manually.

### Getting automatic commission live (Cashfree)
1. Create a **Cashfree merchant account** and complete KYC.
2. Ask Cashfree to **activate Easy Split** on your account (support form /
   account manager) — it is **not** on by default.
3. Onboard each creator as a **vendor** (Add Vendor API / dashboard) with their
   bank or UPI details. The app collects these in **Payout settings** and stores
   them in `creator_payouts`; set that row's `cashfree_vendor_id` once the vendor
   exists. (`creator_payouts` is creator-only under RLS, so vendor creation is
   done with your service role / the Cashfree dashboard.)
4. Supabase secrets: `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`,
   `CASHFREE_ENV=production`, `COMMISSION_PERCENT=10`,
   `CASHFREE_SPLIT_ENABLED=true`, `OWNER_EMAIL=<your login email>`.
5. In `index.html`: `CASHFREE_ENABLED: true`, `CASHFREE_SPLIT_ENABLED: true`,
   `CASHFREE_MODE: 'production'`.

Until Easy Split is on, the platform only *tracks* what is owed — money is not
moved automatically.

---

## Honest notes before going live

- **UPI orders are manually confirmed.** With direct UPI there is no gateway to
  verify the payment, so orders sit as `pending` until you check your bank/UPI
  app and confirm them. If you want automatic verification, enable Cashfree.
- **Test Cashfree in sandbox first.** Use Cashfree test keys with
  `CASHFREE_ENV=sandbox` and `CASHFREE_MODE='sandbox'` in the frontend, then
  switch both to production and set `CASHFREE_ENABLED: true`.
- **Plans are 30-day passes, not auto-renewing subscriptions.** Recurring
  auto-billing would need Cashfree's Subscriptions product; the current flow is
  a simple one-time payment that grants a 30-day pass.
- **Free AI usage is tracked in the browser.** It is a convenience limit, not a
  security boundary. If you need a hard limit, move the counter server-side.
- **Direct social publishing is not included.** The Content Studio generates
  content; posting to Instagram / Facebook / TikTok needs each platform's
  official OAuth/API setup.
- **Whitelisting.** Cashfree will not open the checkout on a domain you have not
  whitelisted in the Cashfree dashboard.

© 2026 CreatorMarket.
