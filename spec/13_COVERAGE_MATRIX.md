# 13 — Coverage Matrix

Status: **DRAFT** · Audit artifact. Traces requirement → flow → design → task → acceptance test →
automated test → status. It does **not** define requirements; it reflects them. `Automated test`
fills in as tests are written; `Status` ∈ `spec` (specified, not built), `in-progress`, `done`.

| Requirement | Flow | Design | Task | Acceptance test | Automated test | Status |
|---|---|---|---|---|---|---|
| CON1 (stack), ARCH §9 | — | ARCH §9 (fresh app, ported tokens/clients) | TASK-PROJECT-001/002 | — | build + Supabase connectivity | done |
| REQ-AUTH-001/002/003 | FLOW-AUTH-001/002 | ARCH accounts | TASK-AUTH-001 | AT-ACCT-001 | — | spec |
| REQ-AUTH-004 | FLOW-AUTH-003 | ARCH accounts | TASK-AUTH-001 | — | — | spec |
| REQ-AUTH-005 | FLOW-ADMIN-* | ARCH trust | TASK-AUTH-001 | AT-SEC-002 | — | spec |
| REQ-ACCT-001..007 | FLOW-ACCT-001/002 | DATA profiles | TASK-ACCT-001 (ADR-002) | AT-ACCT-002/003/004 | — | spec |
| REQ-CONTENT-001..005 | FLOW-CONTENT-001 | ADR-001, DATA slug | TASK-CONTENT-001/002 | AT-CONTENT-001/002 | — | spec |
| REQ-PRACTICE-001/002/003 | FLOW-PRACTICE-001 | DATA questions | TASK-PRACTICE-001 | AT-PRACTICE-001..005 | — | spec |
| REQ-PROGRESS-001..004 | FLOW-PRACTICE-001 | DATA attempts/progress | TASK-PROGRESS-001 | AT-PROGRESS-001/002 | — | spec |
| REQ-CREDIT-001..005 | FLOW-BILLING/BOOK | DATA ledger; RPC | TASK-CREDIT-001 | AT-SEC-003, AT-BILLING-001 | — | spec |
| REQ-BILLING-001..004 | FLOW-BILLING-001 | ARCH billing; INV-7 | TASK-BILLING-001 | AT-BILLING-001..004 | — | spec |
| REQ-BILLING-005 | FLOW-ADMIN-002 | RPC refund_credit | TASK-ADMIN-001 | AT-SEC-002 | — | spec |
| REQ-BOOK-001 | FLOW-ADMIN-001 | DATA slots | TASK-BOOK-001 | — | — | spec |
| REQ-BOOK-002/003/004 | FLOW-BOOK-001 | RPC book_session; INV-3/4/6 | TASK-BOOK-001 | AT-BOOK-001/002/003/004 | — | spec |
| REQ-BOOK-005 | FLOW-BOOK-002 | RPC cancel_booking | TASK-BOOK-003 | AT-BOOK-005 | — | spec |
| REQ-BOOK-006 | FLOW-BOOK-001 | ARCH Google | TASK-BOOK-002 | AT-BOOK-006 | — | spec |
| REQ-NOTIFY-001/002 | FLOW-NOTIFY-001 | ARCH cron/notify | TASK-NOTIFY-001 | AT-NOTIFY-001/002 | — | spec |
| NFR-PERF-001/002/003 | FLOW-CONTENT-001 | ARCH deploy | TASK-CONTENT-001 | AT-CONTENT-001/003 | — | spec |
| NFR-SEC-001 | (all) | DATA RLS table | TASK-ACCT-001 + | AT-SEC-001, AT-PROGRESS-002, AT-PRACTICE-005 | — | spec |
| NFR-SEC-002 | FLOW-BILLING/BOOK | RPC boundary | TASK-CREDIT-001/BOOK-001 | AT-SEC-003 | — | spec |
| NFR-SEC-003 | FLOW-ACCT-001 | ADR-002 (pending) | TASK-ACCT-000 | AT-ACCT-004 | — | spec (blocked) |
| NFR-SEC-004 | FLOW-BILLING-001 | ARCH webhook | TASK-BILLING-001 | AT-BILLING-004 | — | spec |
| NFR-REL-001 | FLOW-BILLING-001 | INV-7 | TASK-BILLING-001 | AT-BILLING-002 | — | spec |
| NFR-REL-002 | FLOW-BOOK-001 | INV-3; FOR UPDATE | TASK-BOOK-001 | AT-BOOK-002 | — | spec |
| NFR-OPS-001/002/003 | FLOW-ADMIN-002 | ARCH observability | TASK-OPS-001 | — | — | spec |

## Gaps / blockers tracked

- **ADR-002 (auth/consent)** blocks NFR-SEC-003 + all M2 tasks — must be authored before M2.
- **D2 (credit-pack tiers)** blocks seeding `credit_packs` in TASK-BILLING-001.
- **Automated-test column** is empty until M1 begins; fill per task as tests land.
- 09_FRONTEND / 10_BACKEND are intentionally light (see those files); component/service detail is
  carried in each task's implementation notes rather than a separate heavy design doc.
