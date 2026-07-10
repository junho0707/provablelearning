-- 0001_init — schema baseline for Provable Learning v2.
--
-- Fresh schema (not ported from v1). Feature tables ship in later, ordered migrations:
--   questions (PRACTICE-001), profiles (ACCT-001), progress (PROGRESS-001),
--   credit_ledger/credit_packs (CREDIT-001), stripe_events (BILLING-001),
--   availability_slots/sessions (BOOK-001), admin_logs (OPS-001).
-- This baseline only ensures the extensions those migrations rely on.

-- gen_random_uuid() and gen_random_bytes() for primary keys / tokens.
create extension if not exists pgcrypto;
