# 04 — Actors

Status: **REWRITTEN 2026-08-14** against `14_GROUND_TRUTH_INTERVIEW.md` + ADR-003/004/005.

> **Superseded:** the v1/pre-pivot Parent / Dependent Student / Independent Student triad, which
> assumed **every learner had a login**. They do not. A learner is a **profile**, not an account.

## The identity model in one line

**One login per buyer. Learner profiles beneath it, with no credentials of their own.**

This is the single most important structural fact in the system, because it is why there is **no
minors'-consent gate at launch** (CON3): no child ever holds credentials.

**Invariant (INV-ACTOR-1):** *owner identity and learner identity are separate records.* A buyer is
never stored as "the learner", even when they are the same person. This keeps a future
profile→login upgrade **additive** rather than a migration.

---

## A1 — Visitor (anonymous)

Anyone, no account.

| | |
|---|---|
| **Can** | Read **every** authored lesson, in full. Attempt every practice question and receive correct/incorrect feedback. Browse the whole roadmap. See prices and the First Session offer. |
| **Cannot** | Save progress. Buy anything. Book anything. See any answer key. |
| **Notes** | The default and most common actor. **Nothing about content is hidden from a Visitor** (ADR-004) — this is what makes the catalog indexable. |

## A2 — Buyer (account owner)

The one authenticated human per account. Usually a parent; sometimes the student.

| | |
|---|---|
| **Identity** | Supabase auth via **Google OAuth or email magic link**. No password (ADR-003). |
| **Owns** | The credit wallet · all learner profiles under the account · all bookings · all purchases. |
| **Can** | Everything a Visitor can. Create/edit/switch/delete learner profiles. Buy the First Session (**once**) and credit packs. Book, cancel, and reschedule sessions. Submit a **no-show credit-return request**. View saved progress for any of their profiles. |
| **Cannot** | See or touch another account's data (RLS). Grant themselves credits. Book without a credit. Buy a second First Session. |

**A2a — Independent student.** The case where the buyer *is* the learner. Not a separate actor: the
buyer simply has one learner profile representing themselves. Supported deliberately (spec/14 §14),
so no flow may assume the buyer and learner are different people.

## A3 — Learner profile

**Not an account. Has no credentials and cannot log in.**

| | |
|---|---|
| **Holds** | `name`, `grade`, `current math class` (a roadmap course node). Nothing more — nothing is collected that isn't used (spec/14 §16). |
| **Used for** | Targeting the strengths & weaknesses assessment · the roadmap's "you are here" · attributing saved progress · naming who a session is for. |
| **Lifecycle** | Created, edited, and deleted by its buyer. Deleting one removes its progress. |

`grade` and `current math class` are **functional inputs**, not demographics: they select assessment
questions and position the learner on the map.

## A4 — Admin-Tutor (the operator, solo)

One person. Both the tutor and the administrator — there is no separation of these roles, and **no
tutor entity exists in the schema** (ADR-003).

| | |
|---|---|
| **Can** | Author content (`content/*.mdx` + `roadmap.json`, in-repo). Set the recurring availability template and exceptions. See all bookings. CRUD practice questions. **Adjust the credit ledger** (pairs with manual Stripe refunds). Approve/deny no-show credit-return requests. Work the **manual SMS reminder queue**. Deliver every session. |
| **Cannot** | *(No product-level restriction — this actor is the owner. Constraint is operational: every money-touching action is **audited**.)* |
| **Notes** | Adding a second tutor is a **known future schema migration**, accepted knowingly (ADR-003). |

## A5 — System (scheduled / webhook)

Not a person; named so contracts can refer to it.

| | |
|---|---|
| **Does** | Handle the **Stripe webhook** (idempotent via `stripe_events`). Send **Resend** email — confirmations, reminders, receipts. Run the **reminder cron** at 24h and 1h with idempotent sent-flags. Create the **Google Calendar event + Meet link after the booking commits**. |
| **Constraint** | Every system write is idempotent. A Google Calendar failure **must not** roll back a booking — the session stands and the missing link surfaces on the admin queue (S10). |

---

## Actor × capability matrix

| Capability | Visitor | Buyer | Admin-Tutor |
|---|:--:|:--:|:--:|
| Read any lesson / attempt questions | ✅ | ✅ | ✅ |
| Browse the roadmap | ✅ | ✅ | ✅ |
| See question answer keys | ❌ | ❌ | ✅ |
| Save progress | ❌ | ✅ | ✅ |
| Manage learner profiles | ❌ | ✅ | ✅ |
| Buy First Session (once) | ❌ | ✅ | — |
| Buy credit packs | ❌ | ✅ | — |
| Book / cancel / reschedule | ❌ | ✅ | ✅ |
| Request a no-show credit back | ❌ | ✅ | — |
| Approve credit-return requests | ❌ | ❌ | ✅ |
| Set availability | ❌ | ❌ | ✅ |
| Adjust the credit ledger | ❌ | ❌ | ✅ |

## Downstream

Drives `05_FLOWS.md` (who initiates each flow), `07_DATA_MODEL.md` (`accounts`,
`learner_profiles`, RLS), and the `AT-SEC-*` acceptance tests.
