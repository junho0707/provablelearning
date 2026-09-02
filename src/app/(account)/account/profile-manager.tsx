"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProfile, deleteProfile, updateProfile } from "@/lib/accounts/profiles";
import { setActiveProfile } from "@/lib/accounts/active-profile";
import { LEARNER_PURPOSES, PURPOSE_LABEL, type LearnerPurpose } from "@/lib/accounts/purposes";
import type { LearnerProfile, ProfileInput } from "@/lib/accounts/types";

type CourseOption = { id: string; title: string };

const inputClass =
  "w-full rounded-lg border border-navy-200 px-3 py-2 text-sm outline-none focus:border-navy-400";

const emptyDraft: ProfileInput = { name: "", grade: "", currentCourseNode: null, purposes: [] };

function CourseSelect({
  value,
  onChange,
  options,
}: {
  value: string | null;
  onChange: (v: string) => void;
  options: CourseOption[];
}) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={inputClass}>
      <option value="">Current class (optional)</option>
      {options.map((c) => (
        <option key={c.id} value={c.id}>
          {c.title}
        </option>
      ))}
    </select>
  );
}

/** Checkboxes, not a `<select multiple>` — the options have to be readable at a glance, and
 * ctrl-clicking a multi-select is a well-known usability trap. */
function PurposePicker({
  value,
  onChange,
}: {
  value: LearnerPurpose[];
  onChange: (next: LearnerPurpose[]) => void;
}) {
  function toggle(purpose: LearnerPurpose) {
    onChange(value.includes(purpose) ? value.filter((p) => p !== purpose) : [...value, purpose]);
  }

  return (
    <fieldset>
      <legend className="mb-2 text-sm text-navy-600">What&apos;s this for? Pick any that apply.</legend>
      <div className="flex flex-col gap-2">
        {LEARNER_PURPOSES.map((purpose) => (
          <label
            key={purpose}
            className="flex cursor-pointer items-center gap-3 rounded-lg border border-navy-100 px-4 py-2.5 text-sm text-navy-800 has-[:checked]:border-navy-400 has-[:checked]:bg-navy-50"
          >
            <input
              type="checkbox"
              checked={value.includes(purpose)}
              onChange={() => toggle(purpose)}
              className="h-4 w-4"
            />
            {PURPOSE_LABEL[purpose]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ProfileRow({
  profile,
  isActive,
  courseOptions,
}: {
  profile: LearnerProfile;
  isActive: boolean;
  courseOptions: CourseOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProfileInput>({
    name: profile.name,
    grade: profile.grade,
    currentCourseNode: profile.currentCourseNode,
    purposes: profile.purposes,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const courseTitle = courseOptions.find((c) => c.id === profile.currentCourseNode)?.title;

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateProfile(profile.id, draft);
      if (!result.ok) return setError(result.message);
      setEditing(false);
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      await deleteProfile(profile.id);
      router.refresh();
    });
  }

  function makeActive() {
    startTransition(async () => {
      await setActiveProfile(profile.id);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <li className="p-3">
        <div className="flex flex-col gap-3">
          <input
            className={inputClass}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Name"
          />
          <input
            className={inputClass}
            value={draft.grade ?? ""}
            onChange={(e) => setDraft({ ...draft, grade: e.target.value })}
            placeholder="Grade"
          />
          <CourseSelect
            value={draft.currentCourseNode ?? null}
            onChange={(v) => setDraft({ ...draft, currentCourseNode: v || null })}
            options={courseOptions}
          />
          <PurposePicker
            value={draft.purposes ?? []}
            onChange={(purposes) => setDraft({ ...draft, purposes })}
          />
          {error && <p className="text-sm text-error">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={pending}
              className="rounded-lg bg-navy-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-60"
            >
              Save
            </button>
            <button onClick={() => setEditing(false)} className="text-sm font-semibold text-navy-500">
              Cancel
            </button>
          </div>
        </div>
      </li>
    );
  }

  const details = [profile.grade, courseTitle].filter(Boolean).join(" · ");

  return (
    <li className="flex items-start justify-between gap-4 p-3">
      <div>
        <p className="font-semibold text-navy-950">
          {profile.name} {isActive && <span className="text-xs font-bold text-gold-600">(active)</span>}
        </p>
        <p className="text-sm text-navy-500">{details || "No details yet"}</p>
        {profile.purposes.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {profile.purposes.map((purpose) => (
              <li
                key={purpose}
                className="rounded-full bg-navy-50 px-2.5 py-0.5 text-xs font-medium text-navy-600"
              >
                {PURPOSE_LABEL[purpose]}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex shrink-0 gap-3 text-sm font-semibold">
        {!isActive && (
          <button onClick={makeActive} disabled={pending} className="text-navy-700 hover:text-navy-950">
            Switch
          </button>
        )}
        <button onClick={() => setEditing(true)} className="text-navy-700 hover:text-navy-950">
          Edit
        </button>
        <button onClick={remove} disabled={pending} className="text-error hover:opacity-75">
          Delete
        </button>
      </div>
    </li>
  );
}

export function ProfileManager({
  profiles,
  activeId,
  courseOptions,
}: {
  profiles: LearnerProfile[];
  activeId: string | null;
  courseOptions: CourseOption[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<ProfileInput>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createProfile(draft);
      if (!result.ok) return setError(result.message);
      setDraft(emptyDraft);
      router.refresh();
    });
  }

  return (
    // The add form reads as the next step after the list, so it sits under it in the same column
    // rather than beside it.
    <div className="max-w-xl">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-navy-400">
        Your profiles
      </h3>
      {profiles.length === 0 ? (
        <p className="text-sm text-navy-500">No profiles yet — add one below.</p>
      ) : (
        <ul className="divide-y divide-navy-100 rounded-xl border border-navy-100 bg-white px-2 shadow-[var(--shadow-card)]">
          {profiles.map((p) => (
            <ProfileRow key={p.id} profile={p} isActive={p.id === activeId} courseOptions={courseOptions} />
          ))}
        </ul>
      )}

      <form
        onSubmit={add}
        className="mt-8 flex flex-col gap-3 rounded-xl border border-navy-100 bg-white p-6 shadow-[var(--shadow-card)]"
      >
        <h3 className="text-sm font-semibold uppercase tracking-widest text-navy-400">
          Add a profile
        </h3>
        <input
          className={inputClass}
          required
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Name"
        />
        <input
          className={inputClass}
          value={draft.grade ?? ""}
          onChange={(e) => setDraft({ ...draft, grade: e.target.value })}
          placeholder="Grade"
        />
        <CourseSelect
          value={draft.currentCourseNode ?? null}
          onChange={(v) => setDraft({ ...draft, currentCourseNode: v || null })}
          options={courseOptions}
        />
        <PurposePicker
          value={draft.purposes ?? []}
          onChange={(purposes) => setDraft({ ...draft, purposes })}
        />
        {error && <p className="text-sm text-error">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-60"
        >
          Add profile
        </button>
      </form>
    </div>
  );
}
