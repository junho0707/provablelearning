# HANDOFF — Provable Learning v2

Written 2026-08-14, at the boundary between **spec work (done)** and **implementation (not
started)**. Read `AGENTS.md` for process and `STATUS.md` for current position; this file carries the
things you cannot infer from either — *why* the specs say what they say, and what not to "fix."

---

## 1. Where the project actually is

**Built and working (30 tests passing, `next build` clean):**

| | |
|---|---|
| MDX content pipeline | `src/lib/content/*` — catalog built from `roadmap/roadmap.json` + `content/*.mdx`, KaTeX server-rendered, all SSG |
| Practice questions | `src/lib/practice/*` — mcq / numeric / free, server-side checking, answers never client-exposed |
| Public roadmap map | `/roadmap` — `src/lib/content/layout.ts` (pure) + `src/components/roadmap/*`, pan/zoom, prereq highlighting, mobile outline |
| Supabase wiring | server/browser/admin clients, migrations `0001_init` + `0002_questions` |

**Written but not built:** everything else. Accounts, money, booking, admin, First Session.

**Content authored:** ~20 lessons, Elementary/Fractions range. Against a K–12 arc.

## 2. The decision history, and why it matters

The product model changed **three times on 2026-08-14**. Read the ADRs in order — each amends the
one before, and the reasoning is the valuable part:

- **ADR-003** — priced everything; solo tutor; passwordless auth; Calendar/Resend/refund decisions.
- **ADR-004** — **made content free and cut the paywall.** Amends ADR-003.
- **ADR-005** — **renamed the $49 SKU to "First Session"** and made the assessment goal-dependent.
  Amends ADR-003.

**Why this matters to you:** these reversals were cheap *because nothing had been built yet*. That
window is now closed. From M3 onward, code sits behind these decisions. Do not treat them as
provisional, and do not re-open them without the owner explicitly asking.

**Authority:** `spec/14` is ground truth, as amended by the ADRs. The rest of `spec/` was rewritten
against it on 2026-08-14 and is current — including `01_PRD`, which was stale and no longer is.

## 3. Deliberate absences — do NOT "fix" these

Every one of these looks like a gap and is a decision. `spec/13_COVERAGE_MATRIX.md` lists them too.

| Absence | Why |
|---|---|
| No `entitlements` table, no paywall, no course SKU | Content is free (ADR-004). A paid course created a delivery obligation a partly-authored catalog can't meet, and gating shrank the SEO surface that *is* the acquisition channel. |
| No `sample: true` flag | Every lesson is public; nothing to promote. |
| No tutor entity | Operator is solo (ADR-003). A second tutor is a known, accepted future migration. |
| No self-serve refunds | Manual in Stripe + an **admin ledger adjustment** so wallet and Stripe can't drift. |
| No SMS integration | The reminder queue is a **worklist**, not an integration. The system sends email only. |
| No password auth | Google OAuth + magic link only — no reset flow, no breach surface. |
| No consent gate | Learner profiles have **no credentials**, so COPPA doesn't bite. This is why the profile model exists. |

## 4. Traps

**The identity model is the subtle one.** `accounts` and `learner_profiles` are separate tables
**even when the buyer is the learner** (independent student). Collapsing them looks like a
simplification and would destroy the property that makes a future profile→login upgrade additive
rather than a migration — and would reintroduce the consent problem. Don't.

**`meet_url` is nullable on purpose.** The Google Calendar call happens *after* the booking
transaction commits. A Google outage must leave a valid booking with a missing link, surfaced on the
admin queue — never a rolled-back booking. `AT-BOOK-006` tests exactly this.

**Rescheduling is not cancel-and-rebook.** At 24h+ it moves the slot and **leaves the ledger
untouched**. Implementing it as a refund/respend pair would show up in the ledger and could be used
to dodge the 24h rule.

**`class_help` mode has no assessment at all.** Not a shorter one — none. A pre-test tells you
nothing when the goal is already known. Don't "complete" the pattern by adding one.

**Answer secrecy is enforced by column-level grants**, not by application code. `answer`,
`tolerance`, and `explanation` are withheld from `anon`/`authenticated`; only the service role reads
them. Don't route question reads through a client that would need those columns.

**Prices live in one config module** with a test asserting they match `spec/14` §11. If you change a
price, change the spec — the test is there to make drift fail CI.

## 5. Accepted risks (already argued, don't re-litigate)

- **Free content is close to a one-way door.** Charging later means charging for what was free.
- **Revenue has one leg:** First Session → credit-pack conversion. And **Vercel Analytics cannot
  measure it** — it must be reconstructed from Stripe by hand until PostHog is adopted.
- **The near-empty map:** ~20 lessons against a K–12 arc reads as ~5% built and can look like
  vaporware. Mitigation is **framing** ("new lessons weekly", make authored regions prominent), not
  scope reduction.
- **Solo-tutor schema** will need a migration if a second tutor is ever hired.

## 6. What to do next

**Optional paper task:** `TASK-SPEC-004`, rebuild the layered `docs/` tree (currently only
`docs/archive/v1-sat/`). The spec set is complete without it; recommendation is to skip until
there's a real system to document.

**Build starts at M3** (`spec/12_IMPLEMENTATION_PLAN.md`):

```
CONFIG-001 (pricing config + drift test)  →  LAND-001 (landing, approved hero copy)
AUTH-001 (Google + magic link)            →  ACCT-001 (accounts + learner profiles)
ROADMAP-002 (course-level nodes)
```

Then **M4 money** → **M5 progress + booking** ← *critical path, carries all revenue* → **M6 admin +
First Session** → **M7 launch**.

**Write `AT-CONTENT-005` early.** It asserts no content route requires an account. ADR-004 is the
decision most likely to erode silently as features land; that test is the guard.

**Landing copy is already approved** — verbatim in `spec/14` §14. Use it as written. The binding
rule: **strengths and next steps, never deficits.** No "diagnosis", "behind", or "struggling"
language anywhere in user-facing copy; it makes parents defensive and excludes the getting-ahead and
test-prep buyers who are half the market.

## 7. Known open follow-ups

1. **Remote migrations not applied.** `0002_questions.sql` + `seed.sql` are verified against a
   **local** stack only. The linked CLI points at the *prod* ref (`vufizavpkjpybsknvyno`) and the
   dev project's DB password isn't available, so DDL was **not** pushed remotely. Until applied,
   `getLessonQuestions` returns `[]` on remote — pages still render, gracefully.
2. **NFR-PERF-002 CWV lab run** — needs a deployed Vercel preview; not doable in this environment.
3. **Launch checklist** (`TASK-OPS-001`): live Stripe products from the pricing config, Resend DNS
   verification, ToS / Privacy / refund pages, analytics on, **apex DNS cutover** from the v1 demo.
   Business entity and Stripe account already exist.

## 8. Environment notes

- Git identity was unset; configured **repo-locally** as `Junho Yoon <junhoyoon00@gmail.com>`.
  Correct it if the name is wrong.
- No Docker in this WSL distro, so no local Supabase stack can be started here.
- `npm test` → 30 tests, 4 files. `npm run build` → clean, content + `/roadmap` prerendered.
