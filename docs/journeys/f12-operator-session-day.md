# F12 — Operator: session day

**Actor:** Admin-Tutor · **Status:** 🟡 code-complete, not live-verified (`TASK-ADMIN-*`)

## Trigger

A session is coming up or happening today.

## Steps

1. Works the **manual SMS reminder queue** — a worklist showing, per upcoming session: the message
   text, the phone number, and time remaining. The operator sends the texts personally; there is no
   SMS integration (`02-invariants.md`).
2. Delivers the 60-minute session over the per-booking Meet link created in F8.
3. Marks the booking `completed` or `no_show` (feeds F10 if no-show).
4. Writes and sends the **written plan within 48 hours**, where one is owed (First Session
   sessions, per F5/F6).

## Why it matters structurally

The SMS worklist is a deliberate absence of automation, not an unfinished feature — see
`02-invariants.md`. Don't build an SMS provider integration here without a decision reopening that.

## Requirements / tests

`REQ-ADMIN-001..006`.

## Components

Not yet built.
