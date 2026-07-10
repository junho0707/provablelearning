# Claude Code Instructions

## Documentation

The doc system is layered (L0 → L4). **Read [docs/README.md](docs/README.md) first** — it has the layer model, build order, locked decisions, and open questions.

Current files:

- `docs/00-business.md` — what we sell + 9 capabilities (plain English, no tech)
- `docs/01-context.md` — actors, external services, journey catalog, glossary
- `docs/02-invariants.md` — entity lifecycles + numbered invariants (`I-1`, `I-2`, …)
- `docs/journeys/*.md` — one file per user-intent arc (13 total; `enroll.md` is the only one fleshed out so far)
- `docs/components/*.md` — one file per code module / RPC / cron / webhook / page-group

Update rule (full version in `docs/README.md`):

- New / changed RPC, cron, webhook, page route → update or add `components/*.md`
- Behavior change in a flow → update the journey file's scenario list
- New constraint, transition, or trigger → update `02-invariants.md`; bump invariant numbers if needed
- New external service or actor → update `01-context.md`
- New capability or change to what the system sells → update `00-business.md` AND write an ADR

If a change touches multiple docs, update them in the same commit.

No update needed for bug fixes, new functions inside an existing module, or UI polish that doesn't change behavior.

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
