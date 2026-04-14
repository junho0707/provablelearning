# Documentation

Five files. Each serves one purpose, no overlap.

| File | Purpose |
|---|---|
| [`SYSTEM.md`](./SYSTEM.md) | Feature-by-feature reference: how every feature works + files to edit when changing it |
| [`SYSTEM_MANAGER_CHECKLIST.md`](./SYSTEM_MANAGER_CHECKLIST.md) | Constants + critical user flows (state diagrams) + code checkpoints — the artifact to verify prod is operational |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | C4 (Context + Container + Component) — tech-heavy structural view |
| [`parent-guide.md`](./parent-guide.md) | End-user guide for parents |
| [`student-guide.md`](./student-guide.md) | End-user guide for students |

## When to update

- New feature / behavior change → `SYSTEM.md`
- Migration, RPC, or webhook handler change → `SYSTEM_MANAGER_CHECKLIST.md`
- New external service, API group, cron, library module, or page route group → `ARCHITECTURE.md`
- End-user UX change → `parent-guide.md` / `student-guide.md`

Rule: if a change touches more than one doc, update all of them in the same commit.
