# Etsy Monitor — TODO

## Before Going Live (Blockers)

- [ ] Create Neon DB for this project and set `DATABASE_URL`
- [ ] Run `npm run db:migrate` — creates the 5 tables
- [ ] Copy `WORKERS_DATABASE_URL` from `workers-site-etsy`
- [ ] Generate and set `CREDENTIALS_ENCRYPTION_KEY` (32-byte hex)
- [ ] Create Axiom dataset `etsy-monitor` and set `AXIOM_TOKEN`
- [ ] Set `OXYLABS_USERNAME` / `OXYLABS_PASSWORD`
- [ ] Generate and set `CRON_SECRET`
- [ ] Set `NEXT_PUBLIC_APP_URL` to production Vercel URL
- [ ] Register Azure AD app → get `tenantId`, `clientId`, `clientSecret` per store mailbox
- [ ] POST each store to `/api/stores` with Outlook credentials
- [ ] Verify cron routes work: trigger each manually and check logs
- [ ] Deploy to Vercel Pro (required for `*/5` cron schedule)
- [ ] Add all env vars to Vercel project settings
- [ ] Confirm crons appear in Vercel Dashboard → Cron Jobs tab

---

## Nice-to-Have Features

### Dashboard Improvements
- [ ] Dark mode toggle (next-themes is already installed)
- [ ] Per-store drill-down page (`/stores/[id]`) with full message history + draft trend
- [ ] Published-today count in StoreOverview — currently shows 0 (needs Axiom query wired up)
- [ ] Store health badge tooltip explaining why it's warning/critical
- [ ] "Last snapshot" timestamp tooltip on draft count cell
- [ ] Total system stats row at bottom of StoreOverview (total drafts, total unread)

### Alerts
- [ ] Webhook delivery for alerts (Slack / Telegram / email)
- [ ] Alert rules management UI (currently API-only)
- [ ] Per-store alert threshold UI (currently API-only)
- [ ] Unread message age alert (check messages older than X hours unread)

### API Wallet
- [ ] OxyLabs plan limit config (so dashboard can show utilization %)
- [ ] Historical spend graph per service on the card
- [ ] Cumulative spend vs budget progress bar
- [ ] Export ledger to CSV

### Messages Feed
- [ ] "Mark all as read" button per store
- [ ] Filter by unread only
- [ ] Search by sender name
- [ ] Message age warning highlight (e.g., red if unread > 4h)

### Graphs
- [ ] Date range picker (currently fixed 7d / 30d)
- [ ] Store multi-select filter for the drafts chart (important for 20+ stores)
- [ ] Export chart data as CSV
- [ ] OxyLabs requests/day chart (data already in Axiom)

### Infrastructure
- [ ] Admin auth (simple JWT login) — currently dashboard is unprotected
- [ ] Rate limiting on POST endpoints
- [ ] Vercel Analytics integration
- [ ] Error boundary components for graceful chart failures
- [ ] Health-check route (`/api/health`) for uptime monitoring

---

## Known Limitations / Tech Debt

- [ ] `published_today` in StoreOverview always shows 0 — needs `/api/charts/published` Axiom query wired into the dashboard endpoint or a dedicated per-store API call
- [ ] OxyLabs stats field names are inferred — verify against actual API response on first run and fix `src/lib/oxylabs/client.ts` normalizer if needed
- [ ] Axiom APL `normalizeAxiomResult()` handles `tables` format — verify this matches the actual `?format=tabular` response; test each APL query in Axiom UI before relying on charts
- [ ] `DialogTrigger` in `ApiWallet` uses the `render` prop pattern (`@base-ui/react`) — test in browser that the dialog opens correctly
- [ ] No pagination on alerts feed "load more" — currently increments page state but doesn't accumulate previous pages
- [ ] Alert dedup is 1-hour fixed — should be configurable per rule
- [ ] Token cache in `graph/auth.ts` is in-memory — lost on every cold start (acceptable; tokens last 1h)

---

## Future Ideas

- [ ] Telegram bot integration — send alerts directly to a Telegram channel
- [ ] Etsy API integration for real published counts (instead of deriving from workers DB)
- [ ] Multi-user access with role-based views (read-only vs admin)
- [ ] Store grouping / tagging for filtering the overview table
- [ ] Automated weekly summary email (cost, messages, publishing activity)
- [ ] Grafana-style dashboard export (share read-only link)
