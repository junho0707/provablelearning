# 05 — Surfaces

Routes, grouped by who may reach them. **EXISTS** / **CHANGE** / **NEW** is relative to the current
codebase.

## 1. Public

| Route | State | Notes |
|---|---|---|
| `/` | **CHANGE** | Marketing page. Must be rebuilt around the offer: First Session $49 vs $75, the purpose options in buyer language, how sessions work. The current hero was written for the free-content model and its "explore the roadmap" CTA points at a page that is no longer public. |
| `/login` | **EXISTS** | Buyer sign-in: Google OAuth popup + magic link. No password field, ever. |
| `/auth/callback` | **EXISTS** | OAuth/magic-link exchange. |
| `/privacy` | **CHANGE** | Must gain the kids-specific disclosure (`06-AUTH-AND-COPPA.md` §4). |
| `/terms`, `/refund-policy` | **EXISTS** | Review for the 6-hour window and the 2/month cap. |
| `/courses/**`, `/roadmap` | **REMOVE FROM PUBLIC** | Content is not public at launch (`00-BUSINESS.md` §1). Unroute them, and drop them from `sitemap.ts` and `robots.ts`. Keep the code and the content — this is a visibility decision, not a deletion. |

## 2. Buyer

| Route | State | Notes |
|---|---|---|
| `/dashboard` | **NEW** | The hub. Empty state prompts adding a first student; once students exist it shows each student's upcoming sessions, their First Session promo if unclaimed, and entry points to every tab below. Today `/account` and `/profiles` split this job and neither is the hub the flows describe. |
| `/profiles` | **CHANGE** | Student management. Must gain credential setting (username + password), password reset, current/previous math class, and primary/secondary purpose with free text. |
| `/credits` · `/wallet` | **CHANGE** | Credits & billing. One tab, not two — currently the balance/ledger view and the purchase view are separate routes. Must also offer the First Session promo as a second entry point (`03-FLOWS.md` F4). |
| `/first-session` | **CHANGE** | First Session purchase. Must become **per student** — pick the student, pick the purpose — and must block a second purchase for a student who already has one. |
| `/book` | **CHANGE** | Slot picker + booking form. Must gain: student selection, purpose, specifics, continue-vs-new-topic, and optional uploads. Must apply the 6-hour minimum, the Monday release cadence, and the 1-hour floor on released slots. |
| `/sessions` | **CHANGE** | Per-student session list, upcoming and past, with cancel/reschedule, the remaining monthly credit-return allowance, the note submission, and links to delivered materials. |
| `/messages` | **NEW** | Threaded conversation with the tutor. |
| `/account` | **CHANGE** | Settings, phone number for SMS reminders, and the **consent controls** in `03-FLOWS.md` F13: per student, review collected data, delete it, revoke consent. |

## 3. Student

All **NEW**. There is no student-facing surface in the codebase today.

| Route | Notes |
|---|---|
| `/student/login` | Username + password. Separate from `/login`; no OAuth, no magic link, no self-signup, no self-service reset — the reset path is the buyer. |
| `/student` | Home. With no booked session it says so plainly. Otherwise it lists what is waiting: pre-session work to do, materials to work through, upcoming session and its Meet link. **This screen is also the student's entire notification channel** — students receive no email (`02-POLICIES.md` §11), so anything they need to know surfaces here. |
| `/student/prepare/[bookingId]` | Pre-session work for one booking, shaped by that booking's purpose (`03-FLOWS.md` F6). Includes the diagnostic when one applies, the descriptive inputs, and uploads. Resumable. |
| `/student/materials/[bookingId]` | Delivered post-session material: explanations, roadmap, practice questions worked **on the site**, with progress saved. |

**Hard rule:** no route under `/student` may read or write billing, credits, bookings, or messages
(`INV-ACTOR-1`). This is enforced by RLS as well as routing.

## 4. Tutor / admin

| Route | State | Notes |
|---|---|---|
| `/admin` | **EXISTS** | Operator home. |
| `/admin/availability` | **CHANGE** | Recurring template + exceptions. Must reflect the Monday release cadence. |
| `/admin/bookings` · `/admin/bookings/[id]` | **CHANGE** | Booking list and detail. Detail must show purpose, specifics, uploads, and diagnostic results, and must host the **post-session authoring form**. |
| `/admin/materials` | **NEW** | Queue of sessions awaiting materials, with the 24-hour target and an overdue view. May be folded into `/admin/bookings` if the queue stays small. |
| `/admin/diagnostics` | **NEW** | Author test-prep and math-by-class diagnostics as data. This is the surface that makes `00-BUSINESS.md` §5's content dependency data entry rather than a code change. |
| `/admin/credit-returns` | **CHANGE** | Review queue. Must display the student's remaining monthly allowance and refuse an approval that would breach the cap. |
| `/admin/messages` | **NEW** | Inbox and replies for buyer threads. |
| `/admin/users` | **EXISTS** | Cross-account read for support. |
| `/admin/questions` | **EXISTS** | Question CRUD. |
| `/admin/reminders` | **EXISTS** | Manual SMS worklist. |

## 5. Machine

| Route | State | Notes |
|---|---|---|
| `/api/webhooks/stripe` | **CHANGE** | Idempotent purchase handling. Must additionally **record the consent event and activate that account's student logins** (`06-AUTH-AND-COPPA.md` §3), and grant a **per-student** First Session entitlement. |
| `/api/cron/session-reminders` | **CHANGE** | Reminder **email to the buyer only**. The student's reminder is in-app (`02-POLICIES.md` §11), so this job emails the parent and writes the student's in-app notification. Also drives the pre-session nudge. |

**No no-show cron.** The operator marks a no-show **by hand** from `/admin/bookings/[id]` at the
15-minute mark — they are in the session and already know. Marking it burns the credit, notifies the
buyer, and shows the remaining monthly allowance.

## 6. Navigation

- **Signed out:** the marketing page and sign-in. Nothing else is reachable.
- **Buyer:** dashboard · booking · credits & billing · sessions · messages · account.
- **Student:** their home and whatever is waiting on it. No global navigation into anything else.
- The old content navigation (`/courses`, `/roadmap`) is removed from the site nav entirely.
