# Claude Code Instructions

## Documentation

Five docs in `docs/`. Keep them in sync with code changes:

- **`SYSTEM.md`** — how every feature works + files to edit. Update when feature behavior changes.
- **`SYSTEM_MANAGER_CHECKLIST.md`** — constants + user flows (state diagrams) + code checkpoints. Update when a migration, RPC, webhook handler, constant, or user flow changes.
- **`ARCHITECTURE.md`** — C4 structural view. Update when:
  - External service added/removed (L1 + L2)
  - API route group under `src/app/api/` added/removed (L2)
  - Cron in `vercel.json` added/removed (L2)
  - Deployment target or database changes (L2)
  - Library module under `src/lib/` added/removed (L3)
  - Page route group under `src/app/` added/removed (L3)
  - Core business term renamed (Glossary)
- **`parent-guide.md`** / **`student-guide.md`** — end-user guides. Update on user-facing UX changes.

No update needed for bug fixes, new functions inside an existing module, or UI polish that doesn't change behavior.

If a change touches multiple docs, update all of them in the same commit.
