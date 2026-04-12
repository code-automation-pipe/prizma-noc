# Etsy Monitor — Setup & Operations Guide

## First-Time Setup

### 1. Create the Neon Databases

You need two Neon databases:

**A. Primary DB (new — for this project)**
1. Go to [neon.tech](https://neon.tech) → New Project → name it `etsy-monitor`
2. Copy the pooled connection string → this is `DATABASE_URL`

**B. Workers DB (existing `workers-site-etsy`)**
- Copy the `DATABASE_URL` from `workers-site-etsy/.env.local`
- This goes into `WORKERS_DATABASE_URL` (read-only by convention)

### 2. Configure Environment Variables

```bash
cp .env.local.example .env.local
```

Fill in every variable:

```bash
# Generate encryption key (run once, keep it secret)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# → paste into CREDENTIALS_ENCRYPTION_KEY

# Generate cron secret
openssl rand -hex 32
# → paste into CRON_SECRET
```

### 3. Run Database Migration

```bash
npm run db:migrate
```

This creates all 5 tables in your primary Neon DB.
Verify with `npm run db:studio`.

### 4. Create Axiom Dataset

1. Log into [axiom.co](https://axiom.co)
2. Datasets → New Dataset → name: `etsy-monitor`
3. Settings → API Tokens → New Token → ingest + query permissions
4. Paste token into `AXIOM_TOKEN`

### 5. Register Azure AD App (per Outlook inbox)

Each Etsy store has one Outlook inbox. Each inbox needs credentials from the same (or separate) Azure app registration.

**Steps:**
1. Go to [portal.azure.com](https://portal.azure.com) → Azure Active Directory → App registrations → **New registration**
2. Name it (e.g., `etsy-monitor-mail`), Supported account type: **Single tenant**
3. **API permissions** → Add a permission → Microsoft Graph → **Application permissions** → `Mail.Read` → Add
4. Click **Grant admin consent**
5. **Certificates & secrets** → New client secret → copy the value immediately
6. Copy **Application (client) ID** and **Directory (tenant) ID** from the Overview page

You now have: `tenantId`, `clientId`, `clientSecret` for this mailbox.

### 6. Add Stores to the Database

Use the API to register each Etsy store. This stores the Outlook credentials encrypted.

```bash
# Start the dev server first
npm run dev

# Then POST each store
curl -X POST http://localhost:3000/api/stores \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Etsy Store Name",
    "shop_id": 12345,
    "outlook_email": "store@yourcompany.com",
    "draft_alert_threshold": 10,
    "outlook_credentials": {
      "tenantId": "your-azure-tenant-id",
      "clientId": "your-app-client-id",
      "clientSecret": "your-client-secret"
    }
  }'
```

`shop_id` must match the `shop_id` used in `workers-site-etsy`'s `product_workflow` table.

### 7. Configure Alert Rules

```bash
# Low drafts alert — fires when a store drops below 10 drafts
curl -X POST http://localhost:3000/api/alerts/rules \
  -H "Content-Type: application/json" \
  -d '{"rule_type": "low_drafts", "threshold": 10, "enabled": true}'

# Global zero publishing alert
curl -X POST http://localhost:3000/api/alerts/rules \
  -H "Content-Type: application/json" \
  -d '{"rule_type": "zero_publishing", "threshold": 0, "enabled": true}'

# Gemini balance warning
curl -X POST http://localhost:3000/api/alerts/rules \
  -H "Content-Type: application/json" \
  -d '{"rule_type": "api_balance", "service": "gemini", "threshold": 5, "enabled": true}'
```

### 8. Deploy to Vercel

```bash
# Link to Vercel project
npx vercel link

# Add all environment variables in Vercel Dashboard:
# Settings → Environment Variables → add each from .env.local

# Deploy
npx vercel --prod
```

> **Important:** Vercel Cron Jobs (`*/5 * * * *`) require the **Pro plan**.
> Verify at: Vercel Dashboard → Project → Cron Jobs tab.

---

## Day-to-Day Operations

### Log API Spend (Manual Ledger)

For Gemini, TMAPI, and Modal — use the "+ Add Entry" button in the API Wallet section,
or via API:

```bash
# Log a topup
curl -X POST https://your-project.vercel.app/api/api-ledger \
  -H "Content-Type: application/json" \
  -d '{"service": "gemini", "entry_type": "topup", "amount": 20, "note": "April topup"}'

# Log spend
curl -X POST https://your-project.vercel.app/api/api-ledger \
  -H "Content-Type: application/json" \
  -d '{"service": "modal", "entry_type": "spend", "amount": 3.50, "note": "GPU run Apr 13"}'
```

### Manually Trigger Cron Jobs (for testing)

```bash
# In development
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/poll-email
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/snapshot-drafts
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/fetch-oxylabs
```

### Add a New Store

Use `POST /api/stores` (see Step 6 above). The new store will be picked up automatically
by the next cron run.

### Update Alert Threshold for a Store

```bash
# Find the store's ID first
curl http://localhost:3000/api/stores

# Update its draft threshold
curl -X PATCH http://localhost:3000/api/stores/{store-id} \
  -H "Content-Type: application/json" \
  -d '{"draft_alert_threshold": 15}'
```

### Disable an Alert Rule

```bash
curl -X PATCH http://localhost:3000/api/alerts/rules/{rule-id} \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

---

## Troubleshooting

### Dashboard shows no draft counts

- Check that `WORKERS_DATABASE_URL` is set and points to `workers-site-etsy` DB
- Manually trigger the cron: `GET /api/cron/snapshot-drafts`
- Check `stores.last_draft_snapshot_at` in Drizzle Studio — should be recent

### No messages appearing in Messages Feed

1. Verify the Outlook inbox has received Etsy notification emails
2. Check the email subject format: must match `Re: Etsy Conversation with *`
3. Verify the Azure app has `Mail.Read` **Application** permission (not Delegated)
4. Verify admin consent was granted in Azure AD
5. Manually trigger: `GET /api/cron/poll-email`
6. Check Vercel Function logs for errors

### Charts are empty

- Axiom charts only show data after crons have run
- Trigger `snapshot-drafts` and check Axiom dataset for `draft_snapshot` events
- APL queries take ~30s of events before they return meaningful data
- Verify `AXIOM_TOKEN` and `AXIOM_DATASET=etsy-monitor` are set

### Cron jobs not running on Vercel

- Confirm you are on the **Pro plan** — free tier only supports daily crons
- Check Vercel Dashboard → Project → **Cron Jobs** tab for execution history
- Verify `CRON_SECRET` in Vercel environment variables matches `.env.local`

### `@azure/msal-node` import errors

- Ensure all cron routes have `export const runtime = 'nodejs'` at the top
- Do not import graph auth/mail modules in client components or edge routes

---

## Architecture Overview

```
Vercel (Next.js 16 App Router)
│
├── Dashboard UI (React Server + Client Components)
│   ├── TopBar        — system health pill + refresh
│   ├── ApiWallet     — 4 service cards (OxyLabs live, others manual)
│   ├── StoreOverview — paginated table, 20 rows/page, searchable
│   ├── MessagesFeed  — per-store Outlook message feed, read/unread toggle
│   ├── GraphsSection — 5 Recharts time-series charts via Axiom APL
│   └── AlertsFeed    — triggered alerts log
│
├── API Routes
│   ├── /api/dashboard         — aggregated data (drives all UI)
│   ├── /api/stores            — store CRUD
│   ├── /api/messages          — message list + read toggle
│   ├── /api/api-ledger        — manual ledger CRUD + balance calc
│   ├── /api/alerts            — triggered alerts list
│   ├── /api/alerts/rules      — alert rule CRUD
│   └── /api/charts/*          — Axiom APL queries for Recharts
│
└── Cron Routes (Vercel Cron, Node runtime)
    ├── /api/cron/poll-email       — every 5 min
    ├── /api/cron/snapshot-drafts  — every hour
    └── /api/cron/fetch-oxylabs    — every hour

Data Stores
├── Neon Postgres (primary)     — stores, messages, alerts, ledger
├── Neon Postgres (workers, RO) — product_workflow draft counts
└── Axiom (etsy-monitor)        — time-series events for charts
```
