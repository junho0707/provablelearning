# ProvableLearning — System Verification Map

> **Date**: 2026-03-11
> **Test Suite**: 146 automated tests (Vitest) + comprehensive manual QA
> **Coverage**: Core business logic, database RPCs, enrollment rules, pricing, scheduling

---

## 1. ENROLLMENT

### 1.1 Seat Reservation (`reserve_seat` RPC)
| Invariant | Verified By |
|-----------|------------|
| Class rows locked atomically (FOR UPDATE) before capacity check | SQL invariant test |
| Capacity check counts across all slot columns (slot_1, slot_2, slot_3, legacy class_id) | SQL invariant test |
| Pending AND active enrollments counted toward capacity | SQL invariant test |
| Agreement must be accepted before enrollment | SQL invariant test |
| Same group_size_type enforced across all slots | SQL invariant test |
| Duplicate slot selection blocked (slot 1 ≠ slot 2 ≠ slot 3) | SQL invariant test |
| LG enrollment blocked after class start date | SQL invariant test + eligibility test |
| Pay Later → active + unpaid, deadline = start + 7 days | SQL invariant test |
| Pay Now → pending + paid (activated by Stripe webhook) | SQL invariant test |
| 4th Saturday end date formula correct for all 7 DOWs | Mathematical proof test (7 cases) |
| End date always lands on a Saturday | Mathematical proof test |
| Enrollment offset always 22-28 days | Mathematical proof test |
| LG uses class start/end dates (not rolling) | SQL invariant test |
| SECURITY DEFINER with search_path = public | SQL invariant test |

### 1.2 Eligibility Checks (`checkEligibility`)
| Rule | Verified By |
|------|------------|
| Class not found → rejected | Integration test (mocked Supabase) |
| LG class already started → rejected | Integration test |
| Duplicate enrollment in same class → rejected | Integration test |
| Class blocked from Phase 2 drop → rejected | Integration test |
| Time conflict with existing enrollment → rejected | Integration test |
| Slot 2 class not found → rejected | Integration test |
| Slots with different group_size_type → rejected | Integration test |
| Slot 1 and Slot 2 on same day → rejected | Integration test |
| Slot 2 time conflict → rejected | Integration test |
| Duplicate enrollment in slot 2 class → rejected | Integration test |
| All checks pass → eligible | Integration test |

### 1.3 Enrollment Flow Ordering
| Invariant | Verified By |
|-----------|------------|
| `reserveSeat()` called before waitlist conversion | Source analysis test |
| Student ownership validated before reservation | Source analysis test |
| Credits NOT used in enrollment (always Stripe) | Source analysis test |

---

## 2. SESSION SCHEDULING

### 2.1 Session Date Computation (`computeSessionDates`)
| Scenario | Verified By |
|----------|------------|
| 4 weekly sessions from start date | Unit test |
| Correct DOW offset when start ≠ meeting day | Unit test |
| Wrap-around when meeting day is before start DOW | Unit test |
| Same-day start when start = meeting day | Unit test |
| Sessions exactly 7 days apart | Unit test |
| Session numbers are 1-indexed | Unit test |
| Custom session count | Unit test |
| Consistent dateStr from Date object | Unit test |

### 2.2 Enrollment Session Interleaving (`computeEnrollmentSessions`)
| Mode | Sessions | Mapping | Verified By |
|------|----------|---------|------------|
| 1-slot (LG) | 4 | Sessions 1-4, single classId | Unit test |
| 2-slot (SG/1:1) | 8 | Odd (1,3,5,7) → slot 1, Even (2,4,6,8) → slot 2 | Unit test |
| 3-slot (3x/wk) | 12 | Round-robin: 1,4,7,10→s1; 2,5,8,11→s2; 3,6,9,12→s3 | Unit test |
| Chronological sort | All | Sessions sorted by date regardless of slot | Unit test |
| Equal distribution | All | Each slot gets exactly 4 sessions | Unit test |

### 2.3 LG 2-Day Sessions (`computeLgSessions`)
| Scenario | Verified By |
|----------|------------|
| 8 sessions from 2 meeting days | Unit test |
| All sessions share same classId | Unit test |
| Sessions numbered 1-8 after chronological sort | Unit test |
| Days alternate correctly (Mon-Wed-Mon-Wed...) | Unit test |
| Strictly chronological ordering | Unit test |

### 2.4 Session Number Mapping (SQL `compute_enrollment_session`)
| Invariant | Verified By |
|-----------|------------|
| 3-slot: round-robin modulo mapping | SQL invariant test |
| 2-slot: odd/even mapping | SQL invariant test |
| 1-slot: direct 1-4 mapping | SQL invariant test |
| Invalid session numbers rejected | SQL invariant test |

---

## 3. CANCELLATION & MAKEUP

### 3.1 Session Cancellation (`cancel_session` RPC)
| Invariant | Verified By |
|-----------|------------|
| Enrollment row locked (FOR UPDATE) | SQL invariant test |
| LG cancellations blocked ("Watch the recording") | SQL invariant test |
| SG requires 24-hour advance notice | SQL invariant test |
| Ownership: student, parent, or admin | SQL invariant test |
| Duplicate cancellation prevention (enrollment-scoped) | SQL invariant test |
| Max sessions: 4 (1-slot), 8 (2-slot), 12 (3-slot) | SQL invariant test |
| Past/current-day cancellation rejected | SQL invariant test |
| Credit deadline = end of week (Sunday 11:59 PM ET) | SQL invariant test |
| `mark_student_absent` uses same max-session logic | Cross-RPC consistency test |

### 3.2 Makeup Booking (`book_makeup_session` RPC)
| Invariant | Verified By |
|-----------|------------|
| Cancellation row locked (FOR UPDATE) | SQL invariant test |
| Only "cancelled" status can be booked | SQL invariant test |
| LG makeup blocked | SQL invariant test |
| Subject-agnostic: only group_size_type must match | SQL invariant test |
| Same-class booking blocked | SQL invariant test |
| Enrolled-class booking blocked (all 3 slots checked) | SQL invariant test |
| Capacity = active enrollments + existing makeup bookings | SQL invariant test |
| Past/current-day booking rejected | SQL invariant test |
| Cancellation status → "rescheduled" after booking | SQL invariant test |
| Session date within enrollment window | SQL invariant test |

### 3.3 Credit-Based Makeup (`book_makeup_with_credit` RPC)
| Invariant | Verified By |
|-----------|------------|
| IS NOT DISTINCT FROM for NULL subject/level matching | SQL invariant test |
| FIFO credit ordering (oldest first) | SQL invariant test |
| Credit row locked (FOR UPDATE) for atomic deduction | SQL invariant test |
| Exactly 1 deducted from remaining_amount | SQL invariant test |
| Capacity check: enrolled + makeup bookings | SQL invariant test |
| Past/current-day booking rejected | SQL invariant test |

---

## 4. DROP CLASS (3-Phase System)

### 4.1 Drop Enrollment RPC (`drop_enrollment`)
| Invariant | Verified By |
|-----------|------------|
| Enrollment locked (FOR UPDATE) | SQL invariant test |
| Only active enrollments can be dropped | SQL invariant + integration test |
| Paid students cannot self-drop | SQL invariant test |
| Phase 1 (>14d before start): clean cancel | SQL invariant test |
| Phase 2 (≤14d before → 7d after): class_blocked + group_size_blocked | SQL invariant test |
| Phase 3 (>7d after start): admin-only | SQL invariant test |
| Server-side phase validation for non-admins | SQL invariant test |
| Orphaned makeup bookings cancelled on drop | SQL invariant test |
| Cancelled makeup count logged | SQL invariant test |

### 4.2 Drop Enrollment TS Function (`dropEnrollment`)
| Scenario | Verified By |
|----------|------------|
| Unauthenticated user → error | Integration test |
| Enrollment not found → error | Integration test |
| "not active" RPC error → user-friendly message | Integration test |
| "Not authorized" RPC error → mapped | Integration test |
| "Cannot self-drop" RPC error → verbatim pass-through | Integration test |
| Successful drop → returns classId | Integration test |
| Waitlist auto-enroll dispatched for both slots | Integration test |

---

## 5. WAITLIST

### 5.1 Auto-Enroll from Waitlist (`auto_enroll_from_waitlist` RPC)
| Invariant | Verified By |
|-----------|------------|
| FIFO ordering (ORDER BY created_at ASC) | SQL invariant test |
| SKIP LOCKED for concurrent safety | SQL invariant test |
| Class locked (FOR UPDATE) | SQL invariant test |
| Entries without agreement → expired | SQL invariant test |
| Duplicate enrollment check before auto-enroll | SQL invariant test |
| Time conflict check across all 3 slot columns | SQL invariant test |
| unique_violation handled gracefully | SQL invariant test |
| Waitlist entry → "converted" after enrollment | SQL invariant test |
| Capacity re-checked after each enrollment | SQL invariant test |
| LG auto-enroll blocked after class starts | SQL invariant test |
| Creates active + unpaid enrollment | SQL invariant test |

### 5.2 Waitlist Join
| Invariant | Verified By |
|-----------|------------|
| Duplicate waitlist entry prevented | Integration test (existing) |

---

## 6. CREDITS

### 6.1 Credit Balance (`getCreditBalance`)
| Scenario | Verified By |
|----------|------------|
| Zero balances when no credits | Unit test |
| Aggregation by group_size_type | Unit test |
| Multiple credits of same type summed | Unit test |
| Unknown group_size_type ignored | Unit test |
| Empty array handled | Unit test |

### 6.2 Credit Application (`applyCredits`)
| Scenario | Verified By |
|----------|------------|
| Returns applied count on success | Unit test |
| Returns 0 + error on RPC failure | Unit test |
| Returns 0 when no matching credits | Unit test |

### 6.3 Credit Redemption (`redeemCreditForMakeup`)
| Scenario | Verified By |
|----------|------------|
| Unauthenticated → error | Integration test |
| Student not found → error | Integration test |
| Not authorized → error | Integration test |
| "No matching credit" RPC error → mapped | Integration test |
| "Session is full" RPC error → mapped | Integration test |

---

## 7. PRICING & BUSINESS CONSTANTS

| Rule | Value | Verified By |
|------|-------|------------|
| Large Group price | $20/mo | Unit test |
| Small Group price | $300/mo | Unit test |
| 1:1 price | $800/mo | Unit test |
| LG capacity range | 10-20 | Unit test |
| SG capacity range | 1-3 | Unit test |
| 1:1 capacity range | 1-1 | Unit test |
| All session durations | 1.5 hours | Unit test |
| Sessions per slot | 4 | Unit test |
| Pending enrollment TTL | 30 min (matches Stripe) | Unit test |
| Waitlist claim window | 24 hours | Unit test |
| Phase 1 boundary | 14 days before start | Unit test |
| Payment deadline | 7 days after start | Unit test |
| Max re-enrollment per subject | 3 | Unit test |
| `formatPrice` cents → dollars | Correct | Unit test |
| `formatTime` 24h → 12h | Correct (all edge cases) | Unit test |
| `formatSchedule` single/dual day | Correct | Unit test |
| `formatSubjectCategory` with detail | Correct | Unit test |
| `dayIndex` Monday-first ordering | Correct | Unit test |

---

## 8. CROSS-SYSTEM CONSISTENCY

| Invariant | Verified By |
|-----------|------------|
| reserve_seat and auto_enroll_from_waitlist use identical capacity queries | Cross-RPC test |
| cancel_session and mark_student_absent use same max-session logic | Cross-RPC test |
| All 6 mutation RPCs are SECURITY DEFINER | Cross-RPC test |
| All SECURITY DEFINER RPCs set search_path = public | Cross-RPC test |

---

## 9. MANUALLY VERIFIED (Not Automated)

The following flows were verified through comprehensive manual QA:

### Auth
- Email + password login/signup
- Google OAuth login with auto-linking
- OAuth callback with child account auto-linking
- Onboarding (role selection, profile creation)
- Password reset flow
- Parent resets child password

### Stripe Integration
- Checkout session creation → redirect
- Webhook: payment completed → enrollment activated
- Webhook: session expired → enrollment cleaned up
- Pay Later flow (active + unpaid, 7-day deadline)

### Google Integration
- Calendar event creation for classes
- Per-student Classroom creation (SG/1:1)
- Per-class Classroom creation (LG)
- Meet link sync
- Student removal from Classroom on drop

### Cron Jobs
- Auto-unenroll past payment deadline
- Waitlist notification processing
- Credit expiration
- Booking reminders

### Dashboard (Parent)
- View children's enrollments, sessions, performance
- Add/remove child accounts
- Cancel session → browse alternate slots → book makeup
- Drop class (all 3 phases)
- Request refund
- Redeem credit for makeup
- Send/receive messages
- View payment history

### Dashboard (Student)
- Full parity with parent dashboard (self-only)
- Submit excuse for absence
- Request makeup for absence

### Dashboard (Admin)
- Class CRUD (LG, SG, 1:1 with batch creation)
- Performance logging (bulk attendance + homework)
- Credit management (issue/view)
- Refund request processing (Stripe refund or credit)
- Makeup request review (approve/deny)
- Message conversations
- Consultation bookings management
- Audit log viewing
- Data export (CSV)

### Public Pages
- Landing page
- Class offerings grid
- Consultation booking calendar

---

## Test Execution

```bash
# Run all automated tests
npm test

# Run specific test groups
npx vitest run src/__tests__/session-dates.test.ts      # 22 tests — scheduling math
npx vitest run src/__tests__/business-logic.test.ts      # 42 tests — constants & formatting
npx vitest run src/__tests__/eligibility-current.test.ts # 11 tests — enrollment rules
npx vitest run src/__tests__/drop-enrollment.test.ts     #  7 tests — drop class flow
npx vitest run src/__tests__/rpc-sql-invariants.test.ts  # 64 tests — database RPC verification
```

---

## Verification Methodology

1. **Unit Tests**: Pure functions tested with deterministic inputs (no mocks needed)
2. **Integration Tests**: Server actions tested with mocked Supabase client (Proxy-based chainable mock)
3. **SQL Invariant Tests**: Migration files parsed to verify critical patterns (FOR UPDATE, capacity queries, authorization, state transitions)
4. **Mathematical Proofs**: 4th Saturday formula verified algebraically for all 7 day-of-week inputs
5. **Cross-RPC Consistency**: Verified that related RPCs use matching logic patterns
6. **Source Analysis**: Code ordering and pattern presence verified via file parsing
7. **Manual QA**: All user-facing flows tested end-to-end in staging environment
