"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { SlotCalendar } from "@/components/booking/slot-calendar";
import { SignUpButton } from "@/components/auth/sign-up-button";
import type { OpenSlot } from "@/lib/booking/slots";
import { sessionTime, zoneAbbreviation } from "@/lib/time-format";
import { BTN_LG, EYEBROW, NOTICE } from "@/lib/ui";

/**
 * Where the picked time goes. `signup` is the marketing page, where the visitor has no account and
 * the honest next step is signing up; `book` is the dashboard, where they can carry the time
 * straight into `/book`.
 *
 * A plain discriminated value rather than a render prop, because these panels are mounted from
 * server components and a function cannot cross that boundary.
 */
type Cta =
  | { kind: "signup"; signedIn: boolean; hasFirstSession: boolean }
  | { kind: "book"; studentId?: string };

/**
 * The schedule, read-only, outside `/book`.
 *
 * `/book` answers "when can I come?" only for someone who already has a credit and has already
 * decided. This panel puts the same grid where the decision is actually made — on the landing page
 * beside the price, and on the dashboard beside the students — so an open Tuesday is a reason to
 * buy rather than something discovered afterwards.
 *
 * It does not book anything and holds nothing: picking a time here only decides where the button
 * under it points.
 */
export function OpenTimes({
  slots,
  timeZone,
  cta,
  footnote,
}: {
  slots: OpenSlot[];
  timeZone: string;
  cta: Cta;
  /** How the schedule works, said under it rather than beside it — the grid is the headline. */
  footnote?: ReactNode;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div>
      <SlotCalendar slots={slots} selected={selected} onSelect={setSelected} timeZone={timeZone} />

      {slots.length > 0 && (
        <div className="mt-6 border-t border-navy-950/10 pt-6">
          {selected ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className={EYEBROW}>Your pick</p>
                <p className="mt-1.5 text-[0.9375rem] font-semibold text-navy-950">
                  {sessionTime(selected, timeZone)}
                </p>
              </div>
              {cta.kind === "signup" ? (
                <SignUpButton
                  signedIn={cta.signedIn}
                  hasFirstSession={cta.hasFirstSession}
                  className={BTN_LG}
                />
              ) : (
                <Link
                  href={`/book?slot=${encodeURIComponent(selected)}${
                    cta.studentId ? `&student=${cta.studentId}` : ""
                  }`}
                  className={BTN_LG}
                >
                  Book this time
                </Link>
              )}
            </div>
          ) : (
            <p className={NOTICE}>
              Pick a day to see its open hours. Times are shown in your time zone (
              {zoneAbbreviation(timeZone)}), and nothing is held until a session is booked.
            </p>
          )}
          {footnote && <p className={`mt-4 ${NOTICE}`}>{footnote}</p>}
        </div>
      )}
    </div>
  );
}
