# Claude Code Instructions

## Documentation

**Read [system/README.md](system/README.md) first**, then `00`–`03` in order. The `system/` tree is
the single source of truth (decided 2026-09-02, ADR-007): business model, actors, policies, flows,
schema, surfaces, verification, and the build plan.

`spec/00`–`spec/14` and `docs/` are **superseded** — they describe the previous product model (free
public content, no student logins, 24-hour policy, one First Session per customer) and are retained
only as decision history. Do not update them. Where anything conflicts with `system/`, `system/` wins.

Update rule:

- Change to what the system sells, the access model, or pricing → update `system/00-BUSINESS.md` AND write an ADR
- Change to a rule (notice window, cancellation, credit return, consent) → `system/02-POLICIES.md` AND the affected flow in `system/03-FLOWS.md`
- New / changed table, RPC, cron, webhook, page route → `system/04-DATA.md` / `system/05-SURFACES.md`
- Curriculum structure change → `roadmap/roadmap.json` (single source of truth, ADR-002)

If a change touches multiple docs, update them in the same commit. No update needed for bug fixes,
new functions inside an existing module, or UI polish that doesn't change behavior.

## Coding Guidelines

Behavioral guidelines derived from Karpathy's observations on LLM coding pitfalls. These apply to every task. Bias toward caution over speed; use judgment on trivial tasks.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```
