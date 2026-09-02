"use client";

import {
  PURPOSES,
  PURPOSE_LABEL,
  SUB_PURPOSES,
  SUB_PURPOSE_LABEL,
  type Purpose,
} from "@/lib/accounts/purposes";

/**
 * What a session is for. Used at both moments the question is asked — buying a First Session (F4)
 * and booking any session (F5) — because they are the same question and two pickers would drift.
 *
 * The purpose selects the whole downstream shape of the session (`system/02-POLICIES.md` §7): what
 * the student is asked for beforehand, and what the tutor delivers afterwards. It is not a label.
 */

const cardClass =
  "flex w-full flex-col items-start rounded-lg border px-4 py-3 text-left transition hover:border-navy-400";

const PURPOSE_HINT: Record<Purpose, string> = {
  test_prep: "PSAT, SAT or ACT — we'll start with a short diagnostic.",
  school: "Keeping up, getting ahead, or prepping for something specific.",
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
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold text-navy-900">
          What&apos;s this session for?
        </legend>
        {PURPOSES.map((purpose) => {
          const selected = value.purpose === purpose;
          return (
            <button
              key={purpose}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange({ purpose, subPurpose: null })}
              className={`${cardClass} ${
                selected ? "border-navy-500 bg-navy-50" : "border-navy-200 bg-white"
              }`}
            >
              <span className="text-sm font-bold text-navy-950">{PURPOSE_LABEL[purpose]}</span>
              <span className="mt-0.5 text-sm text-navy-600">{PURPOSE_HINT[purpose]}</span>
            </button>
          );
        })}
      </fieldset>

      {subOptions.length > 0 && (
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-navy-900">
            {value.purpose === "test_prep" ? "Which test?" : "Which of these fits best?"}
          </span>
          <select
            id={`${idPrefix}-sub`}
            className="w-full rounded-lg border border-navy-200 px-3 py-2 text-sm outline-none focus:border-navy-400"
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
