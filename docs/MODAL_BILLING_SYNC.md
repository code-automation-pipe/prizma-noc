# Modal Billing Sync

Pushes Modal GPU spend into the etsy-monitor dashboard automatically.

---

## Projects involved

| Project | Role |
|---------|------|
| **etsy-monitor** (this repo) | Receives billing data, stores it, shows it on the Modal card |
| **Modal project** (etsy pipeline) | Reads billing from Modal API, POSTs the total to etsy-monitor |

---

## How it works

```
Modal project                         etsy-monitor
─────────────────────────────         ──────────────────────────────────
modal.billing.workspace_billing_report()
  → sum cumulative cost
  → POST /api/cron/modal-billing  →   compute delta vs last sync
    { cumulative_usd: 3.45 }          write spend entry to api_ledger
                                      write balance_snapshot
                                      Modal card updates on next refresh
```

Each sync only records the **delta** since the last run — no double-counting.

---

## Setup

### Step 1 — etsy-monitor (this repo)

No code changes needed. The endpoint `POST /api/cron/modal-billing` is already implemented.

**Env vars required** (`.env.local` locally, Vercel → Environment Variables in production):

| Variable | Value | Where |
|----------|-------|-------|
| `CRON_SECRET` | Any long random string | Already set |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` (local) or your Vercel URL | Already set |

---

### Step 2 — Modal project (etsy pipeline)

Copy the sync script into your Modal project:

```bash
cp /path/to/etsy-monitor/docs/modal_billing_sync.py ./billing_sync.py
```

Install the dependency:

```bash
pip install httpx
```

**Env vars required** in the Modal project:

| Variable | Value | Where to set |
|----------|-------|-------------|
| `ETSY_MONITOR_URL` | `http://localhost:3000` (local) or your Vercel URL | Shell / `.env` / Modal secret |
| `CRON_SECRET` | Same value as in etsy-monitor | Shell / `.env` / Modal secret |
| `MODAL_TOKEN_ID` | Your Modal token ID (`ak-...`) | Already configured in Modal |
| `MODAL_TOKEN_SECRET` | Your Modal token secret (`as-...`) | Already configured in Modal |

> `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET` are used automatically by the Modal CLI —
> you do not need to pass them explicitly unless running in a fresh environment.

---

## Running

### Option A — One-shot (manual sync or testing)

Run from your Modal project directory:

```bash
ETSY_MONITOR_URL=http://localhost:3000 \
CRON_SECRET="MY_SUPER_COMPLEX_SECRET_KEY_THAT_IS_AT_LEAST_64_CHARACTERS_LONG" \
modal run billing_sync.py
```

Expected output:
```
[modal] cumulative cost (last 90 days): $3.4521
[sync] recorded delta=$3.4521  total=$3.4521
[modal] sync complete
```

Then press **Fetch Balances** on the dashboard — the Modal card will show the spend.

---

### Option B — Scheduled cron (auto-sync every 6 hours)

#### 1. Create a Modal secret with the env vars

```bash
modal secret create etsy-monitor-sync \
  ETSY_MONITOR_URL=https://your-app.vercel.app \
  CRON_SECRET=MY_SUPER_COMPLEX_SECRET_KEY_THAT_IS_AT_LEAST_64_CHARACTERS_LONG
```

#### 2. Add the secret to the scheduled function

Open `billing_sync.py` and update the `@app.function` decorator:

```python
@app.function(
    schedule=modal.Period(hours=6),
    secrets=[modal.Secret.from_name("etsy-monitor-sync")],
)
def scheduled_sync() -> None:
    cost = get_modal_cumulative_cost()
    sync_to_monitor(cost)
```

#### 3. Deploy

```bash
modal deploy billing_sync.py
```

#### 4. Verify

```bash
modal app list                    # confirm etsy-billing-sync is running
modal app logs etsy-billing-sync  # check recent runs
```

To stop:
```bash
modal app stop etsy-billing-sync
```

---

## Verify it worked

After running the sync, press **Fetch Balances** on the etsy-monitor dashboard.
The **Modal (GPU)** card should show cumulative spend.

Or check the endpoint directly (with etsy-monitor running):

```bash
curl -X POST http://localhost:3000/api/cron/modal-billing \
  -H "Authorization: Bearer MY_SUPER_COMPLEX_SECRET_KEY_THAT_IS_AT_LEAST_64_CHARACTERS_LONG" \
  -H "Content-Type: application/json" \
  -d '{"cumulative_usd": 3.45}'
# → {"ok":true,"delta":3.45,"cumulative_usd":3.45}
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `ValueError: ETSY_MONITOR_URL and CRON_SECRET must be set` | Missing env vars | Set both before running |
| `401 Unauthorized` from endpoint | Wrong `CRON_SECRET` | Must match `CRON_SECRET` in etsy-monitor `.env` |
| `modal.billing` not available | Modal Hobby plan | Upgrade to Team plan |
| Delta is `$0.00` every run | No new spend since last sync | Normal — check `modal app logs` to confirm runs |
| Modal card shows `$0.00` after sync | Dashboard not refreshed | Press **Fetch Balances** or wait for auto-refresh |
