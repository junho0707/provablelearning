"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { bookSession } from "@/lib/booking/book";
import { PurposePicker, type PurposeValue } from "@/components/purpose-picker";
import { labelFor, isPurpose } from "@/lib/accounts/purposes";

type Student = {
  id: string;
  name: string;
  primaryPurpose: string | null;
  secondaryPurpose: string | null;
  hasFirstSession: boolean;
  hasPreviousSession: boolean;
};

const inputClass =
  "w-full rounded-lg border border-navy-200 px-3 py-2 text-sm outline-none focus:border-navy-400";

/** Groups ISO instants by the **visitor's** local calendar date (UTC stored, browser TZ displayed). */
function groupByLocalDate(slots: string[]) {
  const groups = new Map<string, { iso: string; timeLabel: string }[]>();
  for (const iso of slots) {
    const date = new Date(iso);
    const dateKey = date.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const timeLabel = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    if (!groups.has(dateKey)) groups.set(dateKey, []);
    groups.get(dateKey)!.push({ iso, timeLabel });
  }
  return [...groups.entries()].map(([dateLabel, slots]) => ({ dateLabel, slots }));
}

/**
 * Booking (F5). One form, four questions: who it's for, when, what for, and the specifics.
 *
 * The purpose is asked here rather than inferred from the student's profile because it changes per
 * session — the same child preps for a test one week and works through a unit the next, and each
 * shapes a different hour. Their profile purposes seed the default so the common case is one click.
 */
export function BookingForm({
  slots,
  students,
  balance,
  initialStudentId,
}: {
  slots: string[];
  students: Student[];
  balance: number;
  initialStudentId?: string;
}) {
  const router = useRouter();
  const grouped = useMemo(() => groupByLocalDate(slots), [slots]);

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
    if (needsCredit && balance < 1) return setError("You're out of credits — buy a pack first.");

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
      <div className="rounded-xl border border-navy-100 bg-white p-8 text-center shadow-[var(--shadow-card)]">
        <p className="text-lg font-bold text-navy-950">Booked</p>
        <p className="mt-2 text-navy-700">
          {new Date(confirmed.iso).toLocaleString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
          {confirmed.usedFirstSession ? " — using the first session you bought." : ""}
        </p>
        <p className="mt-3 text-sm text-navy-600">
          We&apos;ve emailed you the details. {student?.name} will see what to do before the session
          when they sign in.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/sessions"
            className="rounded-lg bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-800"
          >
            See my sessions
          </Link>
          <button
            type="button"
            onClick={() => setConfirmed(null)}
            className="rounded-lg border border-navy-200 px-5 py-2.5 text-sm font-semibold text-navy-800 hover:border-navy-400"
          >
            Book another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {students.length > 1 && (
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-navy-900">Who&apos;s this for?</span>
          <select className={inputClass} value={studentId} onChange={(e) => pickStudent(e.target.value)}>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.hasFirstSession ? " — first session available" : ""}
              </option>
            ))}
          </select>
        </label>
      )}

      {student?.hasFirstSession && (
        <p className="rounded-lg border border-gold-300 bg-gold-50 px-4 py-3 text-sm text-navy-800">
          This uses {student.name}&apos;s first session, which is already paid for — no credit will
          be spent.
        </p>
      )}

      <PurposePicker value={purpose} onChange={setPurpose} />

      {/* Only meaningful once there is a previous session to continue from (F5 step 2). */}
      {student?.hasPreviousSession && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold text-navy-900">
            Carrying on, or something new?
          </legend>
          <div className="flex gap-3">
            {(["continue", "new"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={topicMode === mode}
                onClick={() => setTopicMode(mode)}
                className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-semibold transition ${
                  topicMode === mode
                    ? "border-navy-500 bg-navy-50 text-navy-950"
                    : "border-navy-200 bg-white text-navy-700 hover:border-navy-400"
                }`}
              >
                {mode === "continue" ? "Continue last topic" : "Start something new"}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-navy-900">
          Anything specific? <span className="font-normal text-navy-500">(optional)</span>
        </span>
        <textarea
          className={`${inputClass} min-h-24`}
          value={specifics}
          onChange={(e) => setSpecifics(e.target.value)}
          maxLength={2000}
          placeholder="The unit or topic, an upcoming test, or what they're stuck on."
        />
        <span className="text-sm text-navy-600">
          {student?.name} can add more detail and upload their work when they sign in.
        </span>
      </label>

      <div>
        <p className="mb-3 text-sm font-semibold text-navy-900">Pick a time</p>
        {grouped.length === 0 ? (
          <p className="rounded-lg border border-navy-100 bg-white px-4 py-6 text-center text-navy-600">
            No open times right now. New times open every Monday.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {grouped.map((group) => (
              <div key={group.dateLabel}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-navy-400">
                  {group.dateLabel}
                </p>
                <div className="flex flex-wrap gap-2">
                  {group.slots.map((slot) => (
                    <button
                      key={slot.iso}
                      type="button"
                      aria-pressed={selected === slot.iso}
                      onClick={() => setSelected(slot.iso)}
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                        selected === slot.iso
                          ? "border-navy-500 bg-navy-900 text-white"
                          : "border-navy-200 bg-white text-navy-800 hover:border-navy-400"
                      }`}
                    >
                      {slot.timeLabel}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-[var(--error-light)] px-3 py-2 text-sm text-[var(--error)]">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={confirm}
          disabled={pending}
          className="rounded-lg bg-navy-900 px-6 py-3 font-semibold text-white hover:bg-navy-800 disabled:opacity-60"
        >
          {pending ? "Booking…" : "Confirm booking"}
        </button>
        <p className="text-sm text-navy-600">
          {student?.hasFirstSession
            ? "Prepaid — no credit used."
            : `${balance} credit${balance === 1 ? "" : "s"} left.`}
          {purpose.purpose ? ` · ${labelFor(purpose.purpose)}` : ""}
        </p>
      </div>
    </div>
  );
}
