# ProvableLearning Deployment Guide

This guide sets up **two environments** — Dev (local/preview) and Prod (live).

**Accounts you need:**
- [Supabase](https://supabase.com) (free tier works for dev)
- [Stripe](https://stripe.com) (one account, test + live mode)
- [Google Cloud](https://console.cloud.google.com)
- [Resend](https://resend.com)
- [Vercel](https://vercel.com) (Pro plan needed for cron jobs)
- [Twilio](https://twilio.com) *(optional — SMS)*

---

## Phase 1: Supabase (Dev + Prod)

You already have a dev Supabase project (`mlhlugfzzsigraqcxgmh`). Keep it for dev/preview. Create a new one for prod.

### 1A. Create Prod Supabase Project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New Project**
2. Name: `provablelearning-prod`
3. Set a strong DB password (save it somewhere secure)
4. Region: pick the closest to your students (e.g. `us-east-1`)
5. Click **Create new project**, wait for it to provision

### 1B. Copy Prod Credentials

Go to **Settings → API** and save these values (you'll need them for Vercel later):

```
PROD_SUPABASE_URL = <Project URL>
PROD_SUPABASE_ANON_KEY = <anon public key>
PROD_SUPABASE_SERVICE_ROLE_KEY = <service_role key>
```

### 1C. Run All Migrations on Prod

**Option A — CLI (recommended):**
```bash
# Install Supabase CLI if you haven't
npm install -g supabase

# Login
npx supabase login

# Link to your PROD project (find project ref in Supabase dashboard URL)
npx supabase link --project-ref <prod-project-ref>

# Push all migrations
npx supabase db push
```

**Option B — Dashboard:**
Go to **SQL Editor** in the prod project, paste and run each migration file from `supabase/migrations/` in order (00001 through 00090).

### 1D. Seed Admin User on Prod

1. Go to **Authentication → Users → Add User** (email + password)
2. Create your admin account with your real email
3. In **SQL Editor**, run:
   ```sql
   UPDATE public.users
   SET role = 'admin'
   WHERE email = 'your-admin@email.com';
   ```

### 1E. Configure Auth Redirects on Prod

Go to **Authentication → URL Configuration**:

1. **Site URL**: `https://provablelearning.com`
2. **Redirect URLs** — add:
   ```
   https://provablelearning.com/callback
   https://provablelearning.com/callback/**
   ```

### 1F. Keep Dev Supabase As-Is

Your existing dev project stays for local development. Your `.env.local` already points to it. No changes needed.

**Checkpoint:** You now have two Supabase projects. Dev credentials in `.env.local`, prod credentials saved for Step 5.

---

## Phase 2: Stripe (Dev + Prod)

You have one Stripe account. It has both test mode and live mode built in.

### 2A. Verify Dev (Test Mode) Is Working

Your `.env.local` already has test mode keys (`sk_test_`, `pk_test_`). No changes needed for dev.

### 2B. Get Live Mode Keys for Prod

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Toggle **off** the "Test mode" switch (top-right) → you're now in live mode
3. Go to **Developers → API keys**
4. Save these values:
   ```
   PROD_STRIPE_PUBLISHABLE_KEY = pk_live_...
   PROD_STRIPE_SECRET_KEY = sk_live_...
   ```

### 2C. Set Up Live Webhook (after deploy)

You'll create the webhook endpoint in Phase 6 (post-deploy). Skip for now.

**Note:** You do NOT need to create products or prices manually. The app uses `price_data` in checkout sessions, so Stripe auto-creates them on the fly.

**Checkpoint:** You have test keys in `.env.local` for dev, live keys saved for prod.

---

## Phase 3: Google Cloud (Dev + Prod)

You can use the **same GCP project** for both environments. You just need separate OAuth credentials.

### 3A. Create Prod OAuth Credential

1. Go to [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
2. Click **+ Create Credentials → OAuth 2.0 Client ID**
3. Application type: **Web application**
4. Name: `ProvableLearning Prod`
5. **Authorized redirect URIs**: add `https://provablelearning.com/callback`
6. Click **Create**
7. Save:
   ```
   PROD_GOOGLE_CLIENT_ID = <new client ID>
   PROD_GOOGLE_CLIENT_SECRET = <new client secret>
   ```

### 3B. Also Add Prod Redirect URI to Supabase

In your **prod** Supabase project:
1. Go to **Authentication → Providers → Google**
2. Enable it
3. Paste the **prod** Google Client ID and Client Secret
4. Save

*(Your dev Supabase project should already have the dev Google credentials configured.)*

### 3C. Google Calendars

You want **separate calendars** for dev vs prod so test events don't pollute real schedules.

**Dev calendars** — your current ones in `.env.local` are fine for dev. If they're real calendars, consider creating test ones:

1. Go to [Google Calendar](https://calendar.google.com)
2. Left sidebar → **+** → **New calendar**
3. Create `PL Dev - Classes` and `PL Dev - Bookings`
4. For each: **Settings → Integrate calendar** → copy Calendar ID
5. Update `.env.local` with the dev calendar IDs

**Prod calendars** — use your real class calendars:

1. Create (or identify) your real calendars: `PL - Classes` and `PL - Bookings`
2. Copy their Calendar IDs:
   ```
   PROD_GOOGLE_CALENDAR_ID = <real class calendar ID>
   PROD_GOOGLE_BOOKING_CALENDAR_ID = <real booking calendar ID>
   ```

**Checkpoint:** You have dev OAuth creds + dev calendars in `.env.local`, prod OAuth creds + prod calendars saved.

---

## Phase 4: Resend (Email)

### 4A. Verify Domain (if not done)

1. Go to [resend.com](https://resend.com) → **Domains → Add Domain**
2. Enter `provablelearning.com`
3. Add the DNS records Resend gives you (MX, TXT, etc.)
4. Wait for verification (usually minutes)

### 4B. Create Prod API Key

1. Go to **API Keys → Create API Key**
2. Name: `prod`
3. Permission: **Full access** (or Sending access)
4. Save:
   ```
   PROD_RESEND_API_KEY = re_...
   PROD_RESEND_FROM_EMAIL = noreply@provablelearning.com
   ```

### 4C. Dev Email

For local dev, your current `RESEND_API_KEY` in `.env.local` works. You can use the same key for both or create a separate `dev` key.

**Checkpoint:** Domain verified, prod API key saved.

---

## Phase 5: Twilio (SMS) — Optional

Skip this entirely if you don't need SMS yet. The app handles missing Twilio env vars gracefully.

If you want SMS in prod:
1. Go to [twilio.com](https://twilio.com) console
2. Your existing credentials work for both dev and prod (or create a subaccount for isolation)
3. Save:
   ```
   PROD_TWILIO_ACCOUNT_SID = AC...
   PROD_TWILIO_AUTH_TOKEN = ...
   PROD_TWILIO_PHONE_NUMBER = +1...
   ```

---

## Phase 6: Deploy to Vercel

### 6A. Push Code to GitHub

```bash
# If not already a GitHub repo:
gh repo create provablelearning --private --source=. --push

# If already connected, just push:
git add -A && git commit -m "Pre-deployment" && git push
```

### 6B. Import to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repo
3. Framework: Next.js (auto-detected)
4. **Do NOT click Deploy yet** — add env vars first

### 6C. Set Environment Variables

In Vercel → Project → **Settings → Environment Variables**, add each variable below.

**For each variable, set the correct environment scope:**

| Variable | Production Value | Preview/Dev Value |
|----------|-----------------|-------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `<prod Supabase URL>` | `<dev Supabase URL>` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `<prod anon key>` | `<dev anon key>` |
| `SUPABASE_SERVICE_ROLE_KEY` | `<prod service role key>` | `<dev service role key>` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_...` | `pk_test_...` |
| `STRIPE_SECRET_KEY` | `sk_live_...` | `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | *(set after 7A)* | `<your test webhook secret>` |
| `STRIPE_ENABLED` | `true` | `true` |
| `NEXT_PUBLIC_APP_URL` | `https://provablelearning.com` | `https://provablelearning-git-{branch}.vercel.app` |
| `NEXT_PUBLIC_SITE_URL` | `https://provablelearning.com` | *(same as APP_URL)* |
| `CRON_SECRET` | *(generate new — see below)* | `<your dev cron secret>` |
| `GOOGLE_CLIENT_ID` | `<prod Google client ID>` | `<dev Google client ID>` |
| `GOOGLE_CLIENT_SECRET` | `<prod Google client secret>` | `<dev Google client secret>` |
| `GOOGLE_CALENDAR_ID` | `<prod calendar ID>` | `<dev calendar ID>` |
| `GOOGLE_BOOKING_CALENDAR_ID` | `<prod booking calendar ID>` | `<dev booking calendar ID>` |
| `RESEND_API_KEY` | `<prod Resend key>` | `<dev Resend key>` |
| `RESEND_FROM_EMAIL` | `noreply@provablelearning.com` | `noreply@provablelearning.com` |
| `TWILIO_ACCOUNT_SID` | `<prod SID>` | `<dev SID or blank>` |
| `TWILIO_AUTH_TOKEN` | `<prod token>` | `<dev token or blank>` |
| `TWILIO_PHONE_NUMBER` | `<prod number>` | `<dev number or blank>` |

**Generate a prod cron secret:**
```bash
openssl rand -hex 32
```

**How to scope env vars in Vercel:**
- When adding a variable, uncheck the environments you don't want it for
- Add the variable twice (once for Production, once for Preview) with different values
- Or if the value is the same for all envs, check all three boxes

### 6D. Deploy

Click **Deploy** (or redeploy if you already deployed without env vars).

**Checkpoint:** Site is live. Proceed to connect your custom domain before post-deploy setup.

---

## Phase 7: Custom Domain

You own `provablelearning.com`. Connect it now so all integrations use the final URL.

### 7A. Add Domain in Vercel

1. **Vercel → Project → Settings → Domains → Add**
2. Enter `provablelearning.com`
3. Vercel will show DNS records to add. Typical setup:
   - **A record**: `@` → `76.76.21.21`
   - **CNAME**: `www` → `cname.vercel-dns.com`
4. Add these records at your domain registrar (wherever you bought `provablelearning.com`)
5. Wait for DNS propagation + SSL provisioning (usually minutes, can take up to 48h)
6. Verify: visit `https://provablelearning.com` — should load your site

### 7B. Redirect www (optional)

In Vercel Domains settings, also add `www.provablelearning.com` and set it to redirect to `provablelearning.com` (or vice versa).

**Checkpoint:** `https://provablelearning.com` is live with SSL.

---

## Phase 8: Post-Deploy Setup

### 8A. Stripe Prod Webhook

1. Go to **Stripe Dashboard** (make sure you're in **live mode**)
2. **Developers → Webhooks → Add endpoint**
3. Endpoint URL: `https://provablelearning.com/api/webhooks/stripe`
4. Events to listen for:
   - `checkout.session.completed`
   - `checkout.session.expired`
5. Click **Add endpoint**
6. Copy the **Signing secret** (`whsec_...`)
7. Go to **Vercel → Settings → Environment Variables**
8. Set `STRIPE_WEBHOOK_SECRET` = the signing secret (Production scope only)
9. **Redeploy** from Vercel → Deployments → latest → ⋯ → Redeploy

### 8B. Stripe Dev Webhook (optional — for preview deploys)

If you want Stripe webhooks working on preview deployments:
1. Switch Stripe to **test mode**
2. Add another webhook endpoint pointing to your preview URL
3. Set the test webhook secret as `STRIPE_WEBHOOK_SECRET` for Preview env in Vercel

For local dev, use Stripe CLI:
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

### 8C. Verify Cron Jobs

Go to **Vercel → Project → Settings → Cron Jobs**. You should see:

| Job | Schedule | Purpose |
|-----|----------|---------|
| `/api/cron/reconcile` | Daily 6am UTC | Reconcile payments |
| `/api/cron/waitlist-notify` | Every 5 min | Process waitlist queue |
| `/api/cron/backup` | Weekly Sun 3am UTC | DB backup trigger |
| `/api/cron/reports` | Monthly 1st 8am UTC | Monthly reports |
| `/api/cron/cancel-credits` | Every 6 hours | Expire unused credits |
| `/api/cron/booking-reminders` | Every hour | Send session reminders |
| `/api/cron/auto-unenroll` | Daily 6am UTC | Remove unpaid past deadline |

> **Vercel Pro required** ($20/mo) for multiple cron jobs. Free tier only allows 1/day.

---

## Phase 9: Smoke Test (Prod)

Run through these on `https://provablelearning.com`:

### Critical Path
- [ ] Landing page loads at prod URL
- [ ] Admin can sign in (email + password)
- [ ] Admin dashboard loads, all pages accessible

### Auth
- [ ] New parent signs up with email + password
- [ ] New parent signs up with Google OAuth
- [ ] Login/logout cycle works
- [ ] Onboarding flow completes

### Core Flow
- [ ] Parent adds a student
- [ ] Browse classes at `/enroll`
- [ ] Enroll a student (Stripe checkout completes with real card)
  - Use a $20 Large Group class to test with low stakes
  - You can refund immediately after in Stripe dashboard
- [ ] Student dashboard shows enrollment
- [ ] Cancel a session → makeup flow works
- [ ] Admin can see the enrollment, student, logs

### Integrations
- [ ] Check Stripe dashboard — payment appears in live mode
- [ ] Check Google Calendar — events created
- [ ] Check Resend dashboard — emails sent
- [ ] Check Vercel logs (Functions tab) — no errors

---

## Quick Reference: Your Environment Map

```
LOCAL DEV (localhost:3000)
├── Supabase: mlhlugfzzsigraqcxgmh (dev project)
├── Stripe: test mode (sk_test_, pk_test_)
├── Google OAuth: dev credential
├── Google Calendar: dev/test calendars
├── Resend: dev API key
└── .env.local has all dev values

VERCEL PREVIEW (PR deploys)
├── Same as dev (via Vercel Preview env vars)
└── Stripe webhooks: optional (test mode endpoint)

VERCEL PRODUCTION (provablelearning.com)
├── Supabase: new prod project
├── Stripe: live mode (sk_live_, pk_live_)
├── Google OAuth: prod credential (redirect → provablelearning.com/callback)
├── Google Calendar: real class calendars
├── Resend: prod API key
└── All via Vercel Production env vars
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Build fails on Vercel | Run `npm run build` locally first |
| Auth redirect broken | Check Supabase redirect URLs include your exact domain (no trailing slash) |
| Stripe webhook 400s | Verify `STRIPE_WEBHOOK_SECRET` matches the endpoint's signing secret |
| Stripe webhook not firing | Check you're in the right mode (test vs live) |
| Cron jobs not running | Verify Vercel Pro plan + `CRON_SECRET` matches |
| Google OAuth fails | Redirect URI must match exactly — check GCP + Supabase |
| Middleware errors | `NEXT_PUBLIC_SUPABASE_URL` and `ANON_KEY` must be set |
| Emails not sending | Check Resend domain verification + API key |
| Preview deploys hit prod DB | Check env var scoping — Preview should use dev values |
| Google Calendar events in wrong calendar | Check `GOOGLE_CALENDAR_ID` env var per environment |

---

## Favicon & Open Graph Image

Before deploying, ensure you have these files in `src/app/`:

| File | Size | Format | Purpose |
|------|------|--------|---------|
| `favicon.ico` | 32x32 | ICO | Browser tab icon |
| `icon.png` or `icon.svg` | 512x512 | PNG/SVG | Modern browsers, Android |
| `apple-icon.png` | 180x180 | PNG | iOS Safari |
| `opengraph-image.png` | 1200x630 | PNG | Social media previews |

Next.js App Router auto-detects these — no code changes needed.
