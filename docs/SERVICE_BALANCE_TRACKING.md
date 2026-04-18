# Service Balance & Usage Tracking

How to pull live usage/balance data from Modal, TMAPI, and OxyLabs into the dashboard.

---

## Modal

Modal exposes billing data through its Python SDK (`modal.billing`) and CLI.
This is **Team / Enterprise plan only** — Hobby plan does not have the billing API.

### Step 1 — verify you have access

```bash
modal billing report --start 2026-04-01
```

If it prints a cost table, you're on the right plan. If it errors, you're on Hobby.

### Step 2 — understand the output

The report returns one row per App per day:

```
app_name          date        cost_usd
----------------  ----------  --------
etsy-pipeline     2026-04-14  1.23
etsy-pipeline     2026-04-15  3.45
```

### Step 3 — create a Modal function that fetches and reports costs

Add this to your Modal project (runs locally with `modal run`):

```python
# report_costs.py
import modal
import httpx
import os
from datetime import date, timedelta

app = modal.App("etsy-cost-reporter")

@app.local_entrypoint()
def main():
    # Fetch last 7 days
    end   = date.today()
    start = end - timedelta(days=7)

    report = modal.billing.workspace_billing_report(
        start=start.isoformat(),
        end=end.isoformat(),
        resolution="daily",
    )

    # Sum up total cost across all rows
    total = sum(float(row.get("cost_usd", 0)) for row in report)
    today_str = end.isoformat()
    today_cost = sum(
        float(row.get("cost_usd", 0))
        for row in report
        if row.get("date", "").startswith(today_str)
    )

    print(f"Last 7 days: ${total:.4f}  |  Today: ${today_cost:.4f}")

    # Post to etsy-monitor dashboard
    monitor_url = os.environ.get("ETSY_MONITOR_URL", "")
    cron_secret = os.environ.get("CRON_SECRET", "")
    if monitor_url and today_cost > 0:
        httpx.post(
            f"{monitor_url}/api/modal-usage",
            json={"gpu": "A10G", "seconds": (today_cost / 1.10) * 3600, "note": "modal billing API sync"},
            headers={"Authorization": f"Bearer {cron_secret}"},
            timeout=5,
        )
        print("Reported to dashboard.")
```

### Step 4 — run it

```bash
ETSY_MONITOR_URL="https://your-app.vercel.app" \
CRON_SECRET="your-secret" \
modal run report_costs.py
```

### Alternative — just read costs from the dashboard

If you don't want to run the script manually, add it as a scheduled Modal function
(`@app.function(schedule=modal.Period(hours=6))`) so it auto-syncs every 6 hours.

---

## TMAPI

The TMAPI balance client exists in the codebase (`src/lib/tmapi/client.ts`) but the
endpoint path is disabled because it was never confirmed. Follow these steps to find
the real endpoint and enable it.

### Step 1 — find the actual balance endpoint

1. Open [console.tmapi.top](https://console.tmapi.top) and log in
2. Open **browser DevTools** → **Network** tab → filter by **Fetch/XHR**
3. Click on your account name or the "Balance" / "Credits" section in the console
4. Look at the network requests — one of them will hit an endpoint like:
   - `https://api.tmapi.top/v1/user/info`
   - `https://console.tmapi.top/api/user/balance`
   - `https://api.tmapi.top/api/account`
5. Click that request → **Headers** tab → note the exact URL and the `Authorization` header format

### Step 2 — test it with curl

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
     https://api.tmapi.top/v1/user/info
```

Replace the URL with whatever you found in Step 1. The response will contain a
balance/credits field — note its exact key name (e.g. `balance`, `credits`, `remaining`).

### Step 3 — enable the client

Open `src/lib/tmapi/client.ts` and update the two placeholders:

```typescript
// Remove the "return null" line at the top, then update:
const res = await fetch('https://api.tmapi.top/v1/user/info', {   // ← real URL from Step 1
  headers: { Authorization: `Bearer ${apiKey}` },
})

// Update the balance extraction to match the real field name:
const balance = Number(
  data?.balance ??          // ← try real key first
  data?.data?.balance ??
  data?.credits ??
  data?.data?.credits ?? 0
)
```

### Step 4 — add the env var

```bash
# .env.local
TMAPI_API_KEY="your-api-key-here"
```

Same key in Vercel → Environment Variables.

### Step 5 — enable the cron call

Open `src/app/api/cron/fetch-api-balances/route.ts` — the TMAPI section already
calls `fetchTmapiBalance()` and stores the result as a `balance_snapshot`. Once the
client returns real data instead of `null`, it will auto-populate on every cron run.

---

## OxyLabs

**OxyLabs is already fully working.** The `/v2/stats?group_by=day` endpoint is
implemented in `src/lib/oxylabs/client.ts` and called by the hourly cron.

### What is tracked

OxyLabs is subscription-based (you pay a monthly fee, not per-request credits).
There is no "remaining balance" endpoint — instead, the API returns:

| Field | What it means |
|-------|---------------|
| `requests` | HTTP requests consumed today |
| `traffic_bytes` | Bandwidth used today |

These are displayed on the **OxyLabs** dashboard card as daily request count.

### What you can do if you want cost tracking

OxyLabs does not have a pay-as-you-go cost API. Your options:

1. **Log your monthly subscription cost manually** — add a `spend` entry once a month
   via the "Add Entry" dialog on the dashboard:
   - Service: OxyLabs ← *(note: OxyLabs is not in the ledger dialog yet — add it or use a note)*
   - Type: Top-up (paid)
   - Amount: your monthly plan cost

2. **Track requests vs plan limit** — if you know your plan includes e.g. 100K requests/month,
   you can calculate utilization from the stats already being fetched.

### Verify it's working

Hit the "Fetch Balances" button on the dashboard and check the server logs for:

```
[oxylabs] fetched N days of stats, today=XXXX requests
```

If you see `OXYLABS_USERNAME / OXYLABS_PASSWORD not set`, add those env vars to
`.env.local` and Vercel.

---

## Summary

| Service  | Method | Status |
|----------|--------|--------|
| Modal    | `modal.billing.workspace_billing_report()` Python SDK | Manual script, Team plan required |
| TMAPI    | REST API (endpoint TBD — follow Step 1 above) | Needs endpoint confirmation |
| OxyLabs  | `GET /v2/stats?group_by=day` | ✅ Already working |
