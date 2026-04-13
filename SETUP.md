# Etsy Monitor — Setup Checklist

Everything that needs to be configured before the dashboard is fully operational.

---

## 1. Gemini (Google AI Studio)

**Current state:** Shows "Active" (API key works). Quota % requires a GCP service account.

**To enable quota % display:**

1. Go to [aistudio.google.com](https://aistudio.google.com) → "Get API key" → note the linked GCP **project name**
2. Open [console.cloud.google.com](https://console.cloud.google.com) → switch to that project → copy the **Project ID**
3. **IAM & Admin → Service Accounts → + Create Service Account**
   - Name: `etsy-monitor`
   - Role: **Monitoring Viewer** (`roles/monitoring.viewer`)
4. Open the service account → **Keys → Add Key → JSON** → download the file
5. Add to `.env`:
   ```
   GOOGLE_CLOUD_PROJECT_ID="your-project-id"
   GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...entire JSON on one line...}'
   ```
6. Press **Fetch Balances** — card will switch from "Active" to e.g. `87%`

---

## 2. TMAPI / 1688

**Current state:** Manual. Both `/api/user/balance` and `/api/v2/user/balance` return 404 ("no Route matched").

**To fix:**

1. Log in to your TMAPI dashboard
2. Open browser DevTools → **Network tab**
3. Navigate to the credits/balance page and look for the request that returns your balance number
4. Copy the full URL path (e.g. `/api/v3/wallet/balance`)
5. Update `src/lib/tmapi/client.ts` — find the `return null` early-exit at the top and remove it, then update the fetch URL:
   ```ts
   const res = await fetch('https://api.tmapi.io/<correct-path-here>', {
     headers: { Authorization: `Bearer ${apiKey}` },
   })
   ```
6. Press **Fetch Balances** to verify

---

## 3. Modal (GPU)

**Current state:** Manual. Cannot be automated.

**Why:** Modal's entire API (`api.modal.com`) is gRPC-only — every endpoint returns `content-type: application/grpc`. There is no REST JSON API.

**Action:** Log credits manually via **Add Entry** in the API Wallet. Add a `topup` entry when you top up and a `spend` entry periodically based on your Modal usage dashboard.

---

## 4. OxyLabs

**Current state:** Manual / "No balance endpoint". Has a live stats endpoint but not wired up.

**To enable (when ready):**

OxyLabs exposes daily stats at `https://data.oxylabs.io/v2/stats?group_by=day` (Basic Auth with `OXYLABS_USERNAME` / `OXYLABS_PASSWORD`). The cron at `/api/cron/fetch-oxylabs` already fetches it. To show balance, a credit/balance endpoint would need to be found in the OxyLabs dashboard (same approach as TMAPI — check Network tab).

---

## 5. Axiom (Charts)

**Current state:** Event ingestion works. APL queries (charts) return 403.

**To fix:**

1. Go to [app.axiom.co](https://app.axiom.co) → **Settings → API Tokens**
2. Find your token (`xaat-...`) and edit it
3. Under **Dataset Permissions** for `etsy-master-events`, enable **Query** in addition to Ingest
4. Save — the Drafts Over Time, Published Per Day, and Messages Per Day charts will start populating

---

## 6. Store Email (Outlook / Microsoft Graph)

**Current state:** All 5 stores have `PLACEHOLDER` credentials. Email polling is disabled.

**Why this matters:** The "Messages Feed" section and unread message alerts won't work until stores have real Azure AD credentials.

**To configure each store:**

1. Go to [portal.azure.com](https://portal.azure.com) → **Azure Active Directory (Entra ID) → App registrations → + New registration**
   - Name: e.g. `EtsyMonitor-GritGarden`
   - Supported account types: **Accounts in this organizational directory only**
2. After creating: note the **Application (client) ID** and **Directory (tenant) ID**
3. **API permissions → + Add permission → Microsoft Graph → Application permissions**
   - Add `Mail.Read`
   - Click **Grant admin consent**
4. **Certificates & secrets → + New client secret** → copy the **Value** (shown once only)
5. Update the store via API:
   ```
   POST /api/stores
   {
     "name": "GritGarden",
     "shop_id": 23,
     "outlook_email": "liormenachemi11@outlook.com",
     "outlook_credentials": {
       "tenantId": "<Directory ID from step 2>",
       "clientId": "<Application ID from step 2>",
       "clientSecret": "<Secret value from step 4>"
     }
   }
   ```
   Or re-run `npm run db:seed` after filling in the values in `scripts/seed-stores.ts`.

**Stores to configure:**

| Store | Outlook email | shop_id |
|-------|--------------|---------|
| GritGarden | liormenachemi11@outlook.com | 23 |
| CrimsonTrove | maorgur1094@outlook.com | 28 |
| LunarFan | ofirbazal11@outlook.com | 29 |
| HanaPottery | liorofer309@outlook.com | 30 |
| GlimmerLamp | mordahan11@outlook.com | 31 |

> **Note:** You can create one shared Azure AD app that has `Mail.Read` access to all 5 mailboxes, rather than 5 separate apps. This is simpler to manage.

---

## 7. Draft Counts

**Current state:** All stores show 0 drafts.

**Why:** The draft count comes from the `workers-site-etsy` Neon DB (`product_workflow` table). Rows with `status != 'UPLOADED'` count as drafts. If your workers haven't processed products for shops 23–31 yet, the count will be 0. No action needed — counts will populate automatically when the workers run.

---

## Summary

| Item | Status | Effort |
|------|--------|--------|
| Gemini quota % | Needs GCP service account | ~10 min |
| TMAPI balance | Needs correct API endpoint | ~5 min |
| Modal balance | Not possible (gRPC only) | — |
| OxyLabs balance | Endpoint unknown | ~5 min |
| Axiom charts | Needs Query permission on token | ~2 min |
| Store email credentials | Needs Azure AD app per store (or shared) | ~30 min |
| Draft counts | Auto-populates when workers run | — |
