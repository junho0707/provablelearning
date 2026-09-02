# Practice questions

**Code:** `src/lib/practice/{check,questions,actions,types}.ts` · **Serves:** F1 (F4 will extend
it) · **Status:** ✅ built

## What it does

Serves practice-question prompts to anyone, checks submitted answers server-side, and never lets
the answer secret reach the client.

## How it fits together

```
Lesson page ──► getLessonQuestions(slug)  [questions.ts, anon client]
                     → id, prompt, choices only — no answer/tolerance/explanation

Submission  ──► checkAnswer(input)        [actions.ts, "use server"]
                     → service-role read of the full row (incl. answer)
                     → checkSubmission()  [check.ts, pure]
                     → { ok, isCorrect, explanation }  — never the raw answer
```

- **`questions.ts`** (`getLessonQuestions`) — uses the **anon** client (`supabase/public.ts`).
  Selects only presentational columns. Returns `[]` on any error or when a lesson has none, so a
  page never breaks on a DB hiccup — it just renders without questions.
- **`check.ts`** (`checkSubmission`) — pure, deterministic, the single source of truth for
  correctness: `mcq` exact-match, `numeric` within an absolute tolerance (non-numeric input throws
  `MalformedSubmissionError`), `free` never auto-grades — returns `isCorrect: null` and reveals the
  worked explanation.
- **`actions.ts`** (`checkAnswer`, a server action) — the only place that reads the `answer` column,
  via `createAdminClient()` (service role, bypasses RLS). Looks the question up by id, runs
  `checkSubmission`, and returns a discriminated result (`ok`/`not_found`/`malformed`) rather than
  throwing, so the client can render each state inline.

## Why the answer never leaks

Two layers, not one: (1) `getLessonQuestions` uses the anon client and only ever *selects* safe
columns — it has no way to fetch `answer` even if asked; (2) the `answer`/`tolerance`/`explanation`
columns are withheld from `anon`/`authenticated` by **Postgres column-level grants**
(`02-invariants.md`), so even a bug in (1) couldn't leak them — the database itself refuses the
read.

## What depends on it

`src/app/(content)/courses/[slug]/practice-questions.tsx` (the interactive client component under
each lesson). F4 (saved progress) will add a write path here — recording `question_attempts` when
signed in — without changing anonymous checking.
