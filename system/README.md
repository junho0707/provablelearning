# system/ — Provable Learning system truth

**Status: DECIDED 2026-09-02.** This tree is the single source of truth for what the system is and
does. It supersedes `spec/00`–`spec/14` and `docs/`, which describe the previous product model and
are retained only as decision history. **Where anything conflicts with this tree, this tree wins.**

## The three languages

The same system is described three times, deliberately, because three different questions get asked
of it:

| Layer | File(s) | Answers | Language |
|---|---|---|---|
| **Business** | `00-BUSINESS.md` | What is sold, at what price, to whom, and why | Money and market. No schema, no routes. |
| **Actors & policy** | `01-ACTORS.md`, `02-POLICIES.md` | Who may do what, and the rules that bind them | Permissions and obligations. |
| **Flows** | `03-FLOWS.md` | What actually happens, step by step, including when it fails | Journeys — `F1`…`F13`. |
| **System** | `04-DATA.md`, `05-SURFACES.md`, `06-AUTH-AND-COPPA.md` | Tables, RPCs, invariants, routes, auth | Implementation contract. |
| **Verification** | `07-VERIFY.md` | How you know it works | `AT-*` acceptance checks. |
| **Build** | `08-BUILD-PLAN.md` | What to change in the existing codebase | Reconciliation plan. |

## Reading order

New to the project: `00` → `01` → `02` → `03`. That is the whole product.
Implementing: add `04` → `05` → `06`, then work `08`.
Verifying: `07`.

## ID conventions

- `F1`…`F13` — flows (`03-FLOWS.md`)
- `REQ-<AREA>-<n>` — requirements, stated inside the flow that needs them
- `INV-<AREA>-<n>` — invariants the system must never violate (`04-DATA.md`)
- `AT-<AREA>-<n>` — acceptance checks (`07-VERIFY.md`)
- `ADR-<nnn>` — decisions with rationale (`adr/`)

## Update rules

Same discipline as before, retargeted at this tree:

- Change to **what is sold, the access model, or pricing** → update `00-BUSINESS.md` **and write an ADR**
- Change to **a rule** (notice window, cancellation, credit return, consent) → `02-POLICIES.md` **and** the affected flow in `03-FLOWS.md`
- **New or changed table, RPC, cron, webhook, route** → `04-DATA.md` / `05-SURFACES.md`
- **Curriculum structure** → `roadmap/roadmap.json` remains the single source of truth (ADR-002 stands)

If a change touches multiple layers, update them in the same commit. No update needed for bug
fixes, new functions inside an existing module, or UI polish that changes no behavior.

## What is deliberately absent

These look like gaps and are decisions. Do not "fix" them without an ADR.

| Absent | Why |
|---|---|
| Public roadmap / lesson catalog at launch | Hidden until the content is worth showing (ADR-007). Acquisition is paid ads + social instead. |
| Student access to billing, credits, or booking | Money authority belongs to the buyer alone (`01-ACTORS.md`). |
| Student ↔ tutor messaging | Messaging is buyer-only. |
| Self-serve refunds | Manual in Stripe + an admin ledger adjustment, so wallet and Stripe cannot drift. |
| Appeal beyond the 2/month cap | The third miss in a calendar month burns the credit permanently, by design. |
| SMS integration | The reminder queue is an operator worklist, not an integration. |
| Passwords for buyers | Buyers are Google OAuth + magic link only. Only *students* have passwords, set by their parent. |
| A second tutor | Solo operator. A second tutor is a known, accepted future migration. |
