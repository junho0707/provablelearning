"use client";

import {
  PURPOSES,
  PURPOSE_LABEL,
  SUB_PURPOSES,
  SUB_PURPOSE_LABEL,
  type Purpose,
} from "@/lib/accounts/purposes";
import { INPUT, LABEL } from "@/lib/ui";

/**
 * What a session is for. Used at both moments the question is asked — buying a First Session (F4)
 * and booking any session (F5) — because they are the same question and two pickers would drift.
 *
 * The purpose selects the whole downstream shape of the session (`system/02-POLICIES.md` §7): what
 * the student is asked for beforehand, and what the tutor delivers afterwards. It is not a label.
 *
 * The options are a hairline-divided stack rather than three gapped cards, and the chosen one is
 * marked by a filled left rule — selection is drawn with ink, matching the slot picker beside it.
 */

const PURPOSE_HINT: Record<Purpose, string> = {
  test_prep: "PSAT, SAT or ACT.",
  school: "Keeping up, getting ahead, or preparing for quizzes or tests.",
  math_diagnostic: "Find the gaps and work out what to fix first.",
};

export type PurposeValue = { purpose: Purpose | null; subPurpose: string | null };

export function PurposePicker({
  value,
  onChange,
  idPrefix = "purpose",
}: {
  value: PurposeValue;
  onChange: (next: PurposeValue) => void;
  idPrefix?: string;
}) {
  const subOptions: readonly string[] = value.purpose ? SUB_PURPOSES[value.purpose] : [];

  return (
    <div className="flex flex-col gap-5">
      <fieldset>
        <legend className={`mb-3 ${LABEL}`}>What&apos;s this session for?</legend>
        <div className="border-t border-navy-950/10">
          {PURPOSES.map((purpose) => {
            const selected = value.purpose === purpose;
            return (
              <button
                key={purpose}
                type="button"
                aria-pressed={selected}
                onClick={() => onChange({ purpose, subPurpose: null })}
                className={`flex w-full flex-col items-start border-b border-l-2 border-navy-950/10 px-4 py-3.5 text-left ${
                  selected
                    ? "border-l-navy-950 bg-white"
                    : "border-l-transparent hover:border-l-navy-950/25"
                }`}
              >
                <span className="text-[0.9375rem] font-semibold text-navy-950">
                  {PURPOSE_LABEL[purpose]}
                </span>
                <span className="mt-0.5 text-[0.875rem] text-navy-700">
                  {PURPOSE_HINT[purpose]}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {subOptions.length > 0 && (
        <label className="flex flex-col gap-2">
          <span className={LABEL}>
            {value.purpose === "test_prep" ? "Which test?" : "Which of these fits best?"}
          </span>
          <select
            id={`${idPrefix}-sub`}
            className={INPUT}
            value={value.subPurpose ?? ""}
            onChange={(e) => onChange({ ...value, subPurpose: e.target.value || null })}
          >
            <option value="">Choose one</option>
            {subOptions.map((sub) => (
              <option key={sub} value={sub}>
                {SUB_PURPOSE_LABEL[sub] ?? sub}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
