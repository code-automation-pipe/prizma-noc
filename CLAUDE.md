@AGENTS.md

# Etsy Monitor — Claude Code Context

## What This Project Is

A real-time monitoring dashboard for an automated Etsy product management system.
Deployed on Vercel. New standalone repo — not part of `etsy-product-finder` or `workers-site-etsy`.

## Commands

```bash
npm run dev              # Dev server on :3000
npm run build            # Next.js build
npm run db:generate      # Drizzle generate migrations (uses .env.local)
npm run db:migrate       # Apply migrations to Neon (uses .env.local)
npm run db:push          # Push schema without migration files
npm run db:studio        # Drizzle Studio GUI
```

## Architecture

**Stack:** Next.js 16 (App Router) · TypeScript · Drizzle ORM · `@neondatabase/serverless` · Axiom · `@azure/msal-node` · Recharts · shadcn/ui (`@base-ui/react`) · TanStack Query · Vercel Cron

**Two Neon databases:**
- `DATABASE_URL` — primary DB for this project (stores, messages, alerts, ledger)
- `WORKERS_DATABASE_URL` — read-only connection to `workers-site-etsy` for draft counts

**Draft count source:** `workers-site-etsy` Neon DB, table `product_workflow`.
Drafts = rows where `status != 'UPLOADED'` (READY + PROCESSING + QUESTION).
The hourly cron caches counts into `stores.last_draft_count` — dashboard never queries workers DB directly on page load.

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/db/schema.ts` | All 5 Drizzle tables — source of truth for types |
| `src/lib/db/index.ts` | Primary Neon DB connection (`drizzle-orm/neon-http`) |
| `src/lib/db/workers-db.ts` | Read-only query to workers-site-etsy DB |
| `src/lib/crypto/credentials.ts` | AES-256-GCM encrypt/decrypt for Outlook credentials |
| `src/lib/axiom/client.ts` | Axiom ingest + APL query API wrapper |
| `src/lib/axiom/events.ts` | Typed event helpers (draft_snapshot, api_spend, etc.) |
| `src/lib/graph/auth.ts` | Microsoft Graph OAuth2 client credentials token |
| `src/lib/graph/mail.ts` | Fetch + detect Etsy message emails from Outlook |
| `src/lib/oxylabs/client.ts` | OxyLabs daily stats via Basic Auth |
| `src/lib/alerts/engine.ts` | Alert evaluation engine (5 rule types, 1h dedup) |
| `src/lib/health.ts` | `computeStoreHealth()` — healthy/warning/critical |
| `src/app/api/cron/poll-email/route.ts` | Cron: poll Outlook every 5 min |
| `src/app/api/cron/snapshot-drafts/route.ts` | Cron: snapshot draft counts hourly |
| `src/app/api/cron/fetch-oxylabs/route.ts` | Cron: fetch OxyLabs stats hourly |
| `src/app/api/dashboard/route.ts` | Aggregated dashboard data endpoint |
| `src/app/(dashboard)/page.tsx` | Dashboard page (Server Component, ISR 60s) |
| `src/components/dashboard/DashboardClient.tsx` | Client root — TanStack Query auto-refresh |

## Database Schema (Primary DB)

```
stores            — id, name, shop_id (→ workers-site-etsy), outlook_email,
                    outlook_credentials (encrypted), draft_alert_threshold,
                    last_draft_count, last_draft_snapshot_at

etsy_messages     — id, store_id, message_id (UNIQUE — Graph API ID),
                    sender_name, subject, received_at, is_read

alert_rules       — id, store_id (nullable=global), service, rule_type,
                    threshold, enabled
                    rule_types: low_drafts | api_budget | api_balance |
                                unread_message | zero_publishing

triggered_alerts  — id, rule_id, store_id, message, triggered_at

api_ledger        — id, service (gemini|tmapi|modal), entry_type (topup|spend),
                    amount, note
```

## Axiom Dataset: `etsy-monitor`

Event types ingested:
- `draft_snapshot` — shop_id, store_name, draft_count (hourly)
- `products_published` — shop_id, store_name, count (hourly)
- `api_spend` — service, amount, balance_after
- `message_received` — store_id, store_name, sender_name
- `oxylabs_usage` — requests_consumed, traffic_consumed_gb, date

## Cron Jobs (vercel.json)

| Schedule | Route | Purpose |
|----------|-------|---------|
| `*/5 * * * *` | `/api/cron/poll-email` | Poll all Outlook inboxes for new Etsy messages |
| `0 * * * *` | `/api/cron/snapshot-drafts` | Snapshot draft counts from workers DB → Axiom |
| `0 * * * *` | `/api/cron/fetch-oxylabs` | Fetch OxyLabs stats → Axiom |

All cron routes: `export const runtime = 'nodejs'` (required — `@azure/msal-node` is Node-only).
All cron routes validate: `Authorization: Bearer {CRON_SECRET}`.

## API Integrations

| Service | Method | Endpoint |
|---------|--------|---------|
| OxyLabs | Live (hourly) | `GET https://data.oxylabs.io/v2/stats?group_by=day` · Basic Auth |
| Google AI Studio | Manual ledger | No balance API — user logs topups/spend |
| TMAPI / 1688 | Manual ledger | No balance API |
| Modal (GPU) | Manual ledger | No balance API |
| Outlook | Microsoft Graph | `GET /v1.0/users/{email}/mailFolders/Inbox/messages` · client credentials |

## Email Detection Logic

Outlook is polled every 5 min. A message is an Etsy notification if:
1. Subject matches `/Re:\s+Etsy Conversation with .+/i`
2. `bodyPreview` (plain text) contains `"sent you a message"`

Uses `bodyPreview` (not `body.content`) to avoid HTML parsing issues.
Deduplication via `message_id` UNIQUE constraint + `onConflictDoNothing`.

## Gotchas

- **shadcn uses `@base-ui/react`** (not `@radix-ui`) — `asChild` prop does NOT exist on `DialogTrigger`. Use `render` prop pattern instead.
- **Zod v4** uses `.issues` not `.errors` on `ZodError`.
- **Select `onValueChange`** returns `string | null` (not `string`) — always null-guard.
- **`@azure/msal-node`** is Node-only — never import in edge routes or client components.
- **Neon `COUNT(*)`** returns BigInt — always wrap with `Number()`.
- **`NEXT_PUBLIC_APP_URL`** needed for server-to-self fetch in `(dashboard)/page.tsx`; falls back to `VERCEL_URL`.

## Env Vars

See `.env.local.example` for the full list. Required to run:
`DATABASE_URL`, `WORKERS_DATABASE_URL`, `CREDENTIALS_ENCRYPTION_KEY`,
`AXIOM_TOKEN`, `AXIOM_DATASET`, `OXYLABS_USERNAME`, `OXYLABS_PASSWORD`,
`CRON_SECRET`, `NEXT_PUBLIC_APP_URL`
