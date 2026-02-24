# Google Calendar & Workspace Setup Guide

## Overview

ProvableLearning uses Google APIs for:
- **Calendar**: Class schedule blocks, booking widget (free/busy), parent consultation events
- **Classroom**: Student invitations after enrollment
- **Drive**: Backup exports (folder structure)

All three share a single OAuth2 authorization from the admin's Google account.

---

## Step 1: Google Cloud Console

1. Go to [console.cloud.google.com](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. **Enable APIs** (APIs & Services > Library):
   - Google Calendar API
   - Google Classroom API
   - Google Drive API
4. **Create OAuth credentials** (APIs & Services > Credentials > Create Credentials > OAuth Client ID):
   - Application type: **Web application**
   - Authorized redirect URI: `https://<your-domain>/api/auth/google-setup/callback`
   - Copy the **Client ID** and **Client Secret**
5. **OAuth Consent Screen** (APIs & Services > OAuth consent screen):
   - User type: External (or Internal if using Workspace)
   - Add your admin email as a test user
   - Scopes needed: `calendar`, `classroom.courses`, `classroom.rosters`

---

## Step 2: Environment Variables

Add to `.env.local`:

```
GOOGLE_CLIENT_ID=<client-id-from-step-1>
GOOGLE_CLIENT_SECRET=<client-secret-from-step-1>
GOOGLE_CALENDAR_ID=<your-email@domain.com>
```

`GOOGLE_CALENDAR_ID` is the email of the calendar to use for schedule blocks and booking availability. Usually the admin's primary email (e.g. `admin@provablelearning.com`).

---

## Step 3: Database Migrations

Ensure these migrations are applied to Supabase:

| Migration | What it creates |
|-----------|----------------|
| `00029_google_integration.sql` | `google_tokens` table (stores OAuth refresh tokens), `bookings` table, `cohorts.google_classroom_id` |
| `00030_cohort_calendar_event_id.sql` | `cohorts.google_calendar_event_id` (links cohorts to calendar events) |

Apply via Supabase SQL Editor or `npx supabase db push`.

---

## Step 4: One-Time Admin Authorization

This connects the app to the admin's Google account:

1. Log in to ProvableLearning as an **admin** user
2. Visit: `https://<your-domain>/api/auth/google-setup`
3. You'll be redirected to Google's consent screen
4. Grant access to Calendar, Classroom, and Rosters
5. You'll be redirected back to `/admin?google=connected`

**What happens behind the scenes:**
- The callback exchanges the auth code for access + refresh tokens
- Tokens are stored in the `google_tokens` table (encrypted at rest by Supabase)
- The refresh token enables offline access (tokens auto-refresh when expired)

**You only need to do this once.** The refresh token persists until revoked.

---

## Step 5: Verify It Works

### Calendar Blocks (automatic)
1. Create a new cohort in Admin > Cohorts
2. Check the admin's Google Calendar — a recurring weekly event should appear:
   - Format: `[Module Name] — [GroupSize] ([Day] [Time])`
   - Duration: 1 hour, weekly for the module's duration
3. Edit the cohort's meeting time — old event should be deleted, new one created

### Booking Widget
1. Visit `/book` (public page)
2. The available time slots should exclude times blocked by cohort calendar events
3. The widget queries Google Calendar's free/busy API to determine availability

### Post-Enrollment (automatic)
When a student enrollment is activated (via Stripe webhook or credits):
- A calendar invite is sent to the parent's email
- The student is invited to Google Classroom (if `google_classroom_id` is set on the cohort)

---

## How It Works Internally

### Token Management (`src/lib/google/auth.ts`)

```
getOAuth2Client()     → Creates OAuth2 client with credentials
getAuthUrl()          → Generates Google consent screen URL
getAuthedClient()     → Retrieves stored tokens, auto-refreshes if expired
```

`getAuthedClient()` is called by every Google API function. It:
1. Fetches the latest tokens from `google_tokens` table
2. Checks if the access token is expired
3. If expired: refreshes using the refresh token, saves new tokens to DB
4. Returns an authenticated OAuth2 client

### Calendar Functions (`src/lib/google/calendar.ts`)

| Function | Purpose |
|----------|---------|
| `createCohortCalendarBlock()` | Creates recurring weekly event (no attendees, admin schedule block) |
| `deleteCohortCalendarBlock()` | Deletes a calendar event by ID |
| `createClassEvent()` | Creates recurring event WITH attendee (post-enrollment) |
| `createBookingEvent()` | Creates one-off consultation event |
| `getFreeBusy()` | Queries calendar availability for booking widget |

### Cohort → Calendar Flow

```
Admin creates cohort
  → cohort row inserted in DB
  → createCohortCalendarBlock() called
  → Google Calendar event created (weekly, 1hr, no attendees)
  → event ID saved to cohorts.google_calendar_event_id

Admin updates cohort schedule
  → deleteCohortCalendarBlock(oldEventId)
  → createCohortCalendarBlock() with new schedule
  → new event ID saved to cohort row

Calendar failure → logged as warning, cohort still created/updated
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "No tokens found" error | Re-run Step 4 (visit `/api/auth/google-setup`) |
| Calendar events not appearing | Check `GOOGLE_CALENDAR_ID` matches the target calendar email |
| Booking shows wrong availability | Ensure cohort calendar blocks exist on the correct calendar |
| "insufficient permission" | Re-authorize with all required scopes (Step 4) |
| Token refresh failing | Revoke app access in [Google Account Settings](https://myaccount.google.com/permissions), then re-authorize |

---

## File Reference

| File | Purpose |
|------|---------|
| `src/lib/google/auth.ts` | OAuth2 client, token storage/refresh |
| `src/lib/google/calendar.ts` | All calendar operations |
| `src/lib/google/classroom.ts` | Classroom student invitations |
| `src/app/api/auth/google-setup/route.ts` | Initiates OAuth flow (admin-only) |
| `src/app/api/auth/google-setup/callback/route.ts` | Receives auth code, stores tokens |
| `src/app/api/bookings/available-slots/route.ts` | Free/busy slot generation |
| `src/app/(dashboard)/admin/cohorts/actions.ts` | Calls calendar block on create/update |
