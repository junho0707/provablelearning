# ProvableLearning Architecture

This directory documents the system architecture using the [C4 model](https://c4model.com/) at three zoom levels. Each level adds detail — start at Context and drill down as needed.

## Levels

| Level | File | What it shows | When to read |
|-------|------|---------------|--------------|
| **1 — Context** | [c4-context.md](c4-context.md) | The system as a black box, its users, and external services | First day onboarding |
| **2 — Container** | [c4-container.md](c4-container.md) | Runtime containers (Next.js, Supabase, Stripe, etc.) and data flow between them | Setting up your dev environment, understanding deployment |
| **3 — Component** | [c4-component.md](c4-component.md) | Library modules inside the Next.js app and their responsibilities | Before working on a feature or fixing a bug |

## Domain Glossary

| Term | Meaning |
|------|---------|
| **Enrollment** | A student's registration in a class, with payment status and session schedule |
| **Dual-slot** | SG/1:1 enrollments pick two weekly time slots (`slot_1_class_id`, `slot_2_class_id`) |
| **Session** | A single class meeting; computed from enrollment start date + slot schedule |
| **Credit** | Earned when a session is canceled by the tutor; redeemable for a makeup session |
| **Makeup** | A session booked using a credit, in any compatible open slot |
| **Waitlist** | FIFO queue when a class is full; auto-enrolls when a seat opens |
| **Makeup Waitlist** | FIFO queue for a specific makeup slot that's full |
| **Drop** | Withdrawing from a class (3-phase system based on timing relative to start date) |
| **Pay Later** | Enrollment reserved without payment; auto-unenrolled if unpaid after deadline |
| **RPC** | Postgres stored procedure called from the app (e.g., `reserve_seat`, `apply_credits`) |
| **RLS** | Row-Level Security — Postgres policies that restrict data access by user role |
| **Subject Category** | Subject stored on enrollment (not class): `dsat_rw`, `dsat_math`, `dsat_rw_math`, `general_math` |
| **Group Size Types** | `large` (10-20 students, $20/mo), `small` (1-3, $300/mo), `one_on_one` (1, $800/mo) |

## Keeping These Docs Up-to-Date

Update this documentation when any of the following change:

- A new **external service** is added or removed (update Context + Container)
- A new **API route group** is added under `src/app/api/` (update Container)
- A new **library module** is added under `src/lib/` (update Component)
- The **container topology** changes (e.g., new database, new deployment target) (update Container)
- **Core business rules** change (enrollment flow, payment model, credit system) (update relevant level + glossary)
- A new **cron job** is added in `vercel.json` (update Container)

When in doubt, re-read the diagram at each level and ask: "Would a new team member be misled by this?"
