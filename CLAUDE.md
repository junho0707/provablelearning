# Claude Code Instructions

## Architecture Documentation

When making changes that affect the system's structure, check and update the C4 architecture docs in `docs/architecture/`. Specifically:

- **Adding/removing an external service** → update `c4-context.md` (L1) and `c4-container.md` (L2)
- **Adding/removing an API route group** under `src/app/api/` → update `c4-container.md` (L2)
- **Adding/removing a library module** under `src/lib/` → update `c4-component.md` (L3)
- **Adding/removing a cron job** in `vercel.json` → update `c4-container.md` (L2)
- **Adding/removing a page route group** under `src/app/` → update `c4-component.md` (L3)
- **Changing the deployment target or database** → update `c4-container.md` (L2)
- **Changing core business terms** (e.g., renaming enrollment concepts) → update glossary in `c4-index.md`

You do not need to update docs for changes within existing modules (bug fixes, new functions in an existing lib, UI tweaks).
