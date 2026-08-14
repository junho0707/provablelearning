# Claude Code Instructions

## Documentation

**Read [spec/14_GROUND_TRUTH_INTERVIEW.md](spec/14_GROUND_TRUTH_INTERVIEW.md) first** — it is the
current ground truth (decided 2026-08-14): what is sold, the access model, accounts, tutoring ops,
the diagnosis program, and the build order. `spec/01_PRD.md` predates it and is being rewritten
against it; where they disagree, spec/14 wins.

`docs/` is **archived** under `docs/archive/v1-sat/` — it describes the frozen v1 SAT model
(enrollment, waitlists, journeys) and does not describe this system. The layered doc tree will be
rebuilt from spec/14.

Update rule:

- Change to what the system sells, the access model, or pricing → update `spec/14` AND write an ADR
- New / changed RPC, cron, webhook, page route → update `spec/08_API_CONTRACTS.md` / `spec/10_BACKEND.md`
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
