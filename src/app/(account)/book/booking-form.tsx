"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { bookSession } from "@/lib/booking/book";
import { PurposePicker, type PurposeValue } from "@/components/purpose-picker";
import { labelFor, isPurpose } from "@/lib/accounts/purposes";
import { SlotCalendar } from "@/components/booking/slot-calendar";
import { sessionTime } from "@/lib/time-format";
import {
  BTN,
  BTN_LG,
  BTN_SECONDARY,
  H3,
  INPUT,
  LABEL,
  NOTICE_ERROR,
  NOTICE_GOLD,
} from "@/lib/ui";

type Student = {
  id: string;
  name: string;
  primaryPurpose: string | null;
  secondaryPurpose: string | null;
  hasFirstSession: boolean;
  hasPreviousSession: boolean;
};

/**
 * Booking (F5). One form, four questions: who it's for, when, what for, and the specifics.
 *
 * The purpose is asked here rather than inferred from the student's profile because it changes per
 * session — the same child preps for a test one week and works through a unit the next, and each
 * shapes a different hour. Their profile purposes seed the default so the common case is one click.
 *
 * A picked slot and a picked mode are shown by **filling** the square, never by rounding it: the
 * whole site draws selection with ink rather than shape.
 */
export function BookingForm({
  slots,
  students,
  balance,
  initialStudentId,
  timeZone,
}: {
  slots: string[];
  students: Student[];
  balance: number;
  initialStudentId?: string;
  timeZone: string;
}) {
  const router = useRouter();

  const [studentId, setStudentId] = useState(
    initialStudentId && students.some((s) => s.id === initialStudentId)
      ? initialStudentId
      : (students[0]?.id ?? ""),
  );
  const student = students.find((s) => s.id === studentId);

  const [purpose, setPurpose] = useState<PurposeValue>(() => seedPurpose(students[0]));
  const [specifics, setSpecifics] = useState("");
  const [topicMode, setTopicMode] = useState<"new" | "continue">("new");
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ iso: string; usedFirstSession: boolean } | null>(null);
  const [pending, start] = useTransition();

  function seedPurpose(s: Student | undefined): PurposeValue {
    const preset = s?.primaryPurpose;
    if (preset && isPurpose(preset)) return { purpose: preset, subPurpose: null };
    // A profile purpose can be a sub-purpose ("sat") or free text, neither of which is a top-level
    // choice — so leave it unset rather than guessing wrong.
    return { purpose: null, subPurpose: null };
  }

  function pickStudent(id: string) {
    setStudentId(id);
    setPurpose(seedPurpose(students.find((s) => s.id === id)));
    setTopicMode("new");
  }

  // A First Session is prepaid, so it does not need a credit balance.
  const needsCredit = !student?.hasFirstSession;

  function confirm() {
    setError(null);
    if (!studentId) return setError("Pick who this session is for.");
    if (!purpose.purpose) return setError("Pick what the session is for.");
    if (!selected) return setError("Pick a time.");
    if (needsCredit && balance < 1) return setError("You're out of credits — buy a bundle first.");

    start(async () => {
      const result = await bookSession({
        profileId: studentId,
        startsAt: selected,
        purpose: purpose.purpose,
        subPurpose: purpose.subPurpose,
        specifics: specifics.trim() || null,
        topicMode,
      });
      if (!result.ok) return setError(result.message);
      setConfirmed({ iso: selected, usedFirstSession: result.usedFirstSession });
      setSelected(null);
      setSpecifics("");
      router.refresh();
    });
  }

  if (confirmed) {
    return (
      <div className="border border-navy-950/10 bg-white p-8 text-center">
        <p className={H3}>Booked</p>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-navy-700">
          {sessionTime(confirmed.iso, timeZone)}
          {confirmed.usedFirstSession ? " — using the first session you bought." : ""}
        </p>
        <p className="mt-3 text-[0.875rem] leading-relaxed text-navy-950/55">
          We&apos;ve emailed you the details. {student?.name} will see what to do before the session
          when they sign in.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/sessions" className={BTN}>
            See my sessions
          </Link>
          <button type="button" onClick={() => setConfirmed(null)} className={BTN_SECONDARY}>
            Book another
          </button>
        </div>
      </div>
    );
  }

  const costLine = student?.hasFirstSession
    ? `Uses ${student.name}'s first session — already paid for, no credit spent.`
    : "This session uses 1 credit.";
  const shortOfCredits = needsCredit && balance < 1;

  return (
    <div>
      {/* What this will cost, before anything is filled in. A buyer who is out of credits should
          find that out here, not by filling in the whole form and being refused at the end. */}
      <div
        className={`flex flex-wrap items-center justify-between gap-3 border px-5 py-4 ${
          shortOfCredits ? "border-[var(--error)] bg-[var(--error-light)]" : "border-navy-950/10 bg-white"
        }`}
      >
        <div>
          <p className="text-[0.9375rem] font-semibold text-navy-950">
            <span className="tabular-nums">{balance}</span> credit{balance === 1 ? "" : "s"} left
          </p>
          <p className="mt-0.5 text-[0.875rem] text-navy-700">
            {shortOfCredits ? "You'll need one to book this session." : costLine}
          </p>
        </div>
        <Link href="/credits" className={BTN_SECONDARY}>
          {shortOfCredits ? "Buy credits" : "Buy more"}
        </Link>
      </div>

      <div className="mt-10 flex flex-col gap-10">
        <Step n={1} label="Who it's for">
          {/* Named buttons rather than a dropdown, and the same list whether there is one student
              or five: with a dropdown, a lone student read as a label rather than as the choice
              this booking is being made against. Selection is a fill, the way the slot picker and
              the topic toggle mark a choice. */}
          <div className="flex flex-wrap gap-2">
            {students.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={studentId === s.id}
                onClick={() => pickStudent(s.id)}
                className={`border px-4 py-2.5 text-[0.875rem] font-semibold ${
                  studentId === s.id
                    ? "border-navy-950 bg-navy-950 text-white"
                    : "border-navy-950/15 bg-white text-navy-800 hover:border-navy-950"
                }`}
              >
                {s.name}
                {s.hasFirstSession && (
                  <span
                    className={`ml-2 font-normal ${
                      studentId === s.id ? "text-white/70" : "text-navy-950/45"
                    }`}
                  >
                    first session available
                  </span>
                )}
              </button>
            ))}
          </div>

          <Link
            href="/account"
            className="mt-3 inline-block text-[0.875rem] font-semibold text-navy-600 underline hover:text-navy-950"
          >
            + Add another student
          </Link>

          {student?.hasFirstSession && (
            <p className={`mt-4 ${NOTICE_GOLD}`}>
              This uses {student.name}&apos;s first session, which is already paid for — no credit
              will be spent.
            </p>
          )}
        </Step>

        <Step n={2} label="What the session is for">
          <PurposePicker value={purpose} onChange={setPurpose} />

          {/* Only meaningful once there is a previous session to continue from (F5 step 2). */}
          {student?.hasPreviousSession && (
            <fieldset className="mt-6 flex flex-col gap-2">
              <legend className={`mb-2 ${LABEL}`}>Carrying on, or something new?</legend>
              <div className="flex gap-2">
                {(["continue", "new"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={topicMode === mode}
                    onClick={() => setTopicMode(mode)}
                    className={`flex-1 border px-4 py-2.5 text-[0.875rem] font-semibold ${
                      topicMode === mode
                        ? "border-navy-950 bg-navy-950 text-white"
                        : "border-navy-950/15 bg-white text-navy-800 hover:border-navy-950"
                    }`}
                  >
                    {mode === "continue" ? "Continue last topic" : "Start something new"}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
        </Step>

        <Step n={3} label="Anything specific?" optional>
          <textarea
            className={`${INPUT} min-h-24`}
            value={specifics}
            onChange={(e) => setSpecifics(e.target.value)}
            maxLength={2000}
            placeholder="The unit or topic, an upcoming test, or what they're stuck on."
            aria-label="Anything specific?"
          />
          <p className="mt-2 text-[0.875rem] text-navy-950/55">
            {student?.name} can add more detail and upload their work when they sign in.
          </p>
        </Step>

        <Step n={4} label="Pick a time">
          <SlotCalendar slots={slots} selected={selected} onSelect={setSelected} timeZone={timeZone} />
        </Step>

        {error && (
          <p role="alert" className={NOTICE_ERROR}>
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-5 border-t border-navy-950/10 pt-8">
          <button type="button" onClick={confirm} disabled={pending} className={BTN_LG}>
            {pending ? "Booking…" : "Confirm booking"}
          </button>
          <p className="text-[0.875rem] text-navy-950/55">
            {selected
              ? sessionTime(selected, timeZone)
              : "No time picked yet."}
            {purpose.purpose ? ` \u00b7 ${labelFor(purpose.purpose)}` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * One numbered question. The form asks four things and used to run them together as a single column
 * of labels, which read as a settings page rather than as something with a beginning and an end.
 */
function Step({
  n,
  label,
  optional,
  children,
}: {
  n: number;
  label: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-navy-950/10 pt-6">
      <div className="mb-4 flex items-baseline gap-3">
        <span className="text-[0.875rem] font-semibold tabular-nums text-navy-950/35">{n}</span>
        <h2 className="text-[0.9375rem] font-semibold text-navy-950">
          {label}
          {optional && <span className="ml-2 font-normal text-navy-950/45">optional</span>}
        </h2>
      </div>
      {children}
    </section>
  );
}
