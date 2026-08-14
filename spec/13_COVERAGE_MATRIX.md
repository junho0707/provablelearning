# 13 — Coverage Matrix

Status: **REWRITTEN 2026-08-14** against ADR-003/004/005. Every capability traced from PRD →
requirement → flow → acceptance test → implementation task, with current build status.

Legend: ✅ built & verified · 🟡 partly built · ⬜ not started

---

## Capability coverage

| PRD | Requirements | Flows | Acceptance | Task | Status |
|---|---|---|---|---|---|
| **C1** Free open content | REQ-CONTENT-001..004 | F1 | AT-CONTENT-001..005 | CONTENT-001 | ✅ *(AT-CONTENT-005 unwritten)* |
| **C2** Roadmap | REQ-ROADMAP-001..006 | F2 | AT-ROADMAP-001..004 | ROADMAP-001, **ROADMAP-002** | 🟡 *(course nodes pending)* |
| **C3** Practice & progress | REQ-PRACTICE-001..004, REQ-PROGRESS-001..003 | F1, F4 | AT-PRACTICE-001..004, AT-PROGRESS-001..002 | PRACTICE-001, **PROGRESS-001** | 🟡 *(practice ✅, progress ⬜)* |
| **C4** Accounts | REQ-AUTH-001..002, REQ-ACCT-001..004 | F3 | AT-ACCT-001..004, AT-SEC-001 | AUTH-001, ACCT-001 | ⬜ |
| **C5** First Session | REQ-FIRST-001..007 | F5, F6 | AT-FIRST-001..006 | FIRST-001..004 | ⬜ |
| **C6** Credits & booking | REQ-CREDIT-001..004, REQ-BILLING-001..003, REQ-BOOK-001..006, REQ-NOTIFY-001..002 | F7, F8, F9, F10 | AT-BILLING-*, AT-CREDIT-*, AT-BOOK-*, AT-NOTIFY-001 | CONFIG-001, CREDIT-001, BILLING-001/002, AVAIL-001, BOOK-001..005, NOTIFY-001 | ⬜ |
| **C7** Admin ops | REQ-ADMIN-001..006 | F11, F12, F13 | AT-ADMIN-001..003, AT-SEC-002 | ADMIN-001, ADMIN-002 | ⬜ |

## Success-criteria coverage

| | Criterion | Acceptance | Status |
|---|---|---|---|
| S1 | Lessons render, no account | AT-CONTENT-001 | ✅ |
| S2 | Roadmap renders full arc, mobile | AT-ROADMAP-001..003 | ✅ |
| S3 | Answer checking accurate | AT-PRACTICE-001/002 | ✅ |
| S4 | Progress persists per profile | AT-PROGRESS-001/002 | ⬜ |
| S5 | Accounts + cross-account denial | AT-ACCT-001..003, AT-SEC-001 | ⬜ |
| S6 | Purchase credits exactly once | AT-BILLING-001/002 | ⬜ |
| S7 | Atomic booking, no double-book | AT-BOOK-001/002, AT-BOOK-004/005 | ⬜ |
| S8 | Second First Session refused | AT-FIRST-001 | ⬜ |
| S9 | Notifications, no duplicates | AT-NOTIFY-001 | ⬜ |
| S10 | Booking survives Google failure | AT-BOOK-006 | ⬜ |
| S11 | Authz holds; answers never leak | AT-SEC-001..003, AT-CONTENT-004 | 🟡 *(answer secrecy ✅)* |

## Constraint coverage

| Constraint | Where enforced | Status |
|---|---|---|
| CON1 reuse v1 patterns | BOOK-001, CREDIT-001 (ported RPCs) | ⬜ |
| CON2 writes in RPCs | NFR-SEC-002 · AT-SEC-003 | ⬜ |
| CON3 consent deferred | No child credentials; `accounts` ≠ `learner_profiles` | ✅ *by design* |
| CON4 one-time payments | No subscription code path exists | ✅ *by absence* |
| CON5 solo operator | No tutor entity in `07_DATA_MODEL` | ✅ *by absence* |
| CON6 organic search | NFR-PERF-001/003 · **AT-CONTENT-005** | 🟡 *(guard test unwritten)* |
| CON7 US only | Pricing config USD | ⬜ |

## Invariants

| | Invariant | Enforced by |
|---|---|---|
| INV-ACTOR-1 | Owner identity ≠ learner identity | Separate tables (`07`) |
| INV-MONEY-1 | Balance never negative | Row lock inside spend RPC |
| INV-MONEY-2 | ≤1 First Session per account | Partial unique index + pre-checkout check |
| INV-MONEY-3 | Webhook redelivery is a no-op | `stripe_events` insert-first |
| INV-BOOK-1 | ≤1 live booking per slot | Row lock inside `book_session` |
| INV-BOOK-2 | `meet_url` nullable by design | Calendar call **after** commit |

---

## Gaps and known holes

**Deliberate absences** *(not gaps — do not "fix")*: no entitlements table, no paywall, no
`sample` flag (ADR-004); no tutor entity (ADR-003); no self-serve refunds; no SMS integration.

**Real gaps to close:**

1. **AT-CONTENT-005 is unwritten** — the regression guard that no content route requires an account.
   Worth writing early, since it is the one test protecting ADR-004 from erosion.
2. **NFR-PERF-002** — CWV lab run still not done; needs a deployed preview.
3. **Remote migrations** — `0002_questions.sql` + `seed.sql` verified **locally only**. Until
   applied remotely, `getLessonQuestions` returns `[]` (pages still render — graceful).
4. **Analytics cannot report the conversion rate** the model rests on (spec/14 §17). Accepted;
   PostHog is the upgrade path.
5. **The near-empty map** — ~20 lessons against a K–12 arc. Mitigation is framing, not scope.

## Doc tree

`docs/` currently holds **only** the v1 archive (`docs/archive/v1-sat/`). Rebuilding the layered
tree from spec/14 is **TASK-SPEC-004**, the last open paper task.
