"""
Modal → Etsy Monitor billing sync
----------------------------------
Run manually:
    python docs/modal_billing_sync.py

Or schedule as a Modal cron (runs every 6 hours automatically):
    modal run docs/modal_billing_sync.py          # one-shot
    modal deploy docs/modal_billing_sync.py       # deploy the cron

Requires env vars:
    ETSY_MONITOR_URL   — your app URL, e.g. https://your-app.vercel.app or http://localhost:3000
    CRON_SECRET        — same value as in etsy-monitor .env
"""

import os
import modal
import httpx
from datetime import datetime, timezone, timedelta

app = modal.App("etsy-billing-sync")


def get_modal_cumulative_cost() -> float:
    """Fetch total Modal spend since the beginning of the year (rolling 90 days)."""
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=90)

    report = modal.billing.workspace_billing_report(
        start=start.isoformat(),
        end=now.isoformat(),
    )

    total = sum(float(row.get("cost_usd", 0)) for row in report)
    return round(total, 6)


def sync_to_monitor(cumulative_usd: float) -> None:
    monitor_url = os.environ.get("ETSY_MONITOR_URL", "").rstrip("/")
    cron_secret = os.environ.get("CRON_SECRET", "")

    if not monitor_url or not cron_secret:
        raise ValueError("ETSY_MONITOR_URL and CRON_SECRET must be set")

    r = httpx.post(
        f"{monitor_url}/api/cron/modal-billing",
        json={"cumulative_usd": cumulative_usd},
        headers={"Authorization": f"Bearer {cron_secret}"},
        timeout=15,
    )
    r.raise_for_status()
    result = r.json()
    print(f"[sync] recorded delta=${result['delta']:.4f}  total=${result['cumulative_usd']:.4f}")


@app.local_entrypoint()
def main() -> None:
    cost = get_modal_cumulative_cost()
    print(f"[modal] cumulative cost (last 90 days): ${cost:.4f}")
    sync_to_monitor(cost)
    print("[modal] sync complete")


# Optional: deploy as a scheduled cron — runs every 6 hours automatically
@app.function(schedule=modal.Period(hours=6))
def scheduled_sync() -> None:
    cost = get_modal_cumulative_cost()
    print(f"[modal] scheduled sync — cumulative: ${cost:.4f}")
    sync_to_monitor(cost)
