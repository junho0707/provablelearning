# Core Flow Verification Strategy

## The Problem with Logic-by-Logic Verification

Attempting to verify every single piece of logic independently leads to:

- **Combinatorial explosion** — hundreds of validators, RPCs, triggers, constraints, each checked in isolation
- **False confidence** — a trigger works in isolation but breaks when combined with the real enrollment flow
- **Wasted effort** — verifying edge cases for code paths that are never actually reached
- **No signal on what matters** — a passing check on an unused constraint tells you nothing about system health

## The New Approach: Run Core Flows, Then Verify State

Instead of asking *"Does every piece of logic work?"*, ask *"Do the flows users actually perform produce correct state?"*

### Principle

> A system is valid if every core user flow, executed end-to-end, produces the expected database state and UI result.

If a trigger, RPC, or constraint is correct, it will show up as correct state after a flow. If it's broken, the flow will fail or produce wrong state. Either way, the flow is the source of truth — not the individual logic unit.

---

## Core Flows to Verify

### Flow 1: Admin Setup
**Action:** Admin creates classes (LG, SG, 1:1) with schedules, caps, and prices.
**Verify:**
- Classes exist with correct `group_size_type`, `capacity`, `meeting_day`, `meeting_time`
- Constraints enforced (capacity limits by group size, required fields)

### Flow 2: Student/Parent Signup
**Action:** New user signs up (email+password or Google OAuth), onboards, adds child (if parent).
**Verify:**
- User created with correct role
- Student record linked (parent→child or independent)
- Auth session active

### Flow 3: Enrollment (Pay Now)
**Action:** Student browses classes → selects slots → pays via Stripe → enrollment activated.
**Verify:**
- `enrollments` row: status=`active`, payment_status=`paid`, correct `slot_1_class_id`/`slot_2_class_id`
- Seat counts decremented (class capacity reduced)
- Stripe checkout completed, webhook processed
- Session dates computed correctly (`computeEnrollmentSessions`)
- Google Classroom invitation sent (if applicable)

### Flow 4: Enrollment (Pay Later)
**Action:** Student enrolls with pay-later → active+unpaid → pays before deadline.
**Verify:**
- Enrollment created as `active` + `unpaid`
- `payment_deadline` set (start + 7 days)
- After payment: status stays `active`, payment_status→`paid`
- If deadline passes without payment: auto-unenroll cron cancels enrollment

### Flow 5: Session Cancellation + Makeup Booking
**Action:** Student cancels upcoming session → books alternate session (same subject+level).
**Verify:**
- `session_cancellations` row created with correct `session_date`, `session_number`
- Makeup booking created in alternate class slot
- Original session marked cancelled, alternate session shows in dashboard
- Credit NOT issued (credit is only for when no alternate is available)

### Flow 6: Credit Issuance + Redemption
**Action:** Cancel session with no alternate available → credit issued → redeem later.
**Verify:**
- Credit row created with correct `amount`, `reason`, linked to cancellation
- Balance reflected in `getCreditBalance()`
- Redemption: credit applied to future makeup booking, balance decremented
- FIFO ordering of credit consumption (`apply_credits` RPC)

### Flow 7: Drop Class
**Action:** Student drops class at various phases.
**Verify:**
- Phase 1 (>14d before start): enrollment status→`cancelled`, seat released
- Phase 2 (<=14d before → 7d after): note created, student blocked from re-enroll
- Phase 3 (>7d after start): refund consultation only, no self-serve
- Paid students: cannot self-drop in any phase

### Flow 8: Waitlist Join + Notification + Acceptance
**Action:** Class full → student joins waitlist → seat opens → notified → accepts offer.
**Verify:**
- LG: `waitlist` row with `class_id` set, auto-enrolled when seat opens
- SG/1:1: `waitlist` row with `preferred_class_ids`, notified with `offer_expires_at`
- Offer acceptance: Stripe checkout → enrollment created → waitlist status=`converted`
- Expiry: if not accepted within window, status→`expired`, next in queue notified

### Flow 9: Waitlist Cancel/Modify
**Action:** Student cancels waitlist entry or modifies preferred slots.
**Verify:**
- Entry removed or updated, seat reservation released if applicable
- UI reflects change immediately

### Flow 10: Admin Operations
**Action:** Admin logs performance, manages refunds, views calendar, sends messages.
**Verify:**
- Performance logs: unique per `(student_id, class_id, session_number)`
- Refund requests: created, reviewed, approved/denied with admin_logs
- Messages: delivered, grouped by conversation

### Flow 11: Cron Jobs
**Action:** Scheduled jobs run (auto-unenroll, waitlist-notify, cancel-credits, reports).
**Verify:**
- Auto-unenroll: unpaid past deadline → cancelled
- Waitlist-notify: expired offers cycled, next student notified
- Cancel-credits: credits issued for unresolved cancellations
- Booking reminders: sent at correct intervals

---

## How to Run a Verification Pass

### Step 1: Execute the flow
Perform the user action end-to-end (UI or API call).

### Step 2: Check resulting state
Query the database for the expected rows, statuses, and relationships.

### Step 3: Check UI reflects state
Dashboard shows correct enrollments, waitlist entries, credits, cancellations.

### Step 4: Check cascading effects
Did triggers fire? Did RPC side-effects run? Did notifications send?

### Step 5: Record result
- **PASS**: Flow produces expected state at every checkpoint
- **FAIL**: Document which checkpoint failed and the actual vs expected state

---

## Why This Is Better

| Aspect | Logic-by-Logic | Core Flow |
|--------|---------------|-----------|
| **Coverage** | Every logic unit, many unused | Every path users actually take |
| **Confidence** | Unit-level (misses integration bugs) | End-to-end (catches real failures) |
| **Effort** | O(n) where n = total logic units | O(k) where k = core flows (~11) |
| **Signal** | "This trigger works in isolation" | "This user action works correctly" |
| **Maintenance** | Must update when any logic changes | Only update when flows change |
| **Debugging** | Hard to trace which flow is broken | Flow failure points directly to the issue |

---

## Flow Dependencies

```
Flow 1 (Admin Setup)
  └─→ Flow 2 (Signup)
        └─→ Flow 3 (Enroll Pay Now)
        └─→ Flow 4 (Enroll Pay Later)
              └─→ Flow 5 (Cancel + Makeup)
              └─→ Flow 6 (Credits)
              └─→ Flow 7 (Drop Class)
        └─→ Flow 8 (Waitlist)
        └─→ Flow 9 (Waitlist Cancel)
  └─→ Flow 10 (Admin Ops)
  └─→ Flow 11 (Cron Jobs)
```

Flows 1-2 are prerequisites. Flows 3-9 can be verified in parallel once setup is done. Flows 10-11 are independent.
