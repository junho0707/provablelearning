"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProfile, updateProfile } from "@/lib/accounts/profiles";
import { setStudentCredentials, resetStudentPassword } from "@/lib/accounts/student-credentials";
import { revokeConsentForStudent, deleteStudent } from "@/lib/accounts/consent";
import { PROFILE_PURPOSE_PRESETS, labelFor } from "@/lib/accounts/purposes";
import type { LearnerProfile, ProfileInput } from "@/lib/accounts/types";

/**
 * Students, their credentials, and the consent controls that must sit beside them
 * (`system/03-FLOWS.md` F2 and F13).
 *
 * Credentials and consent are shown on the same row as the student deliberately: a parent asking
 * "what does my child have access to" should not have to assemble the answer from three screens.
 */

type CourseOption = { id: string; title: string };

const inputClass =
  "w-full rounded-lg border border-navy-200 px-3 py-2 text-sm outline-none focus:border-navy-400";

const emptyDraft: ProfileInput = {
  name: "",
  grade: "",
  currentMathClass: "",
  previousMathClass: "",
  primaryPurpose: null,
  secondaryPurpose: null,
  currentCourseNode: null,
};

/**
 * Presets with a free-text escape hatch. ADR-007 kept purposes open — a parent whose reason isn't
 * listed should be able to say it in their own words rather than mis-file themselves into the
 * nearest wrong option, which would then mis-shape the whole session.
 */
function PurposeSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const isPreset = value === null || PROFILE_PURPOSE_PRESETS.some((p) => p.value === value);
  const [custom, setCustom] = useState(!isPreset);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-navy-900">{label}</span>
      {custom ? (
        <div className="flex gap-2">
          <input
            className={inputClass}
            placeholder="Tell us in your own words"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
          />
          <button
            type="button"
            onClick={() => {
              setCustom(false);
              onChange(null);
            }}
            className="whitespace-nowrap text-sm font-semibold text-navy-600 hover:text-navy-900"
          >
            Pick one
          </button>
        </div>
      ) : (
        <select
          className={inputClass}
          value={value ?? ""}
          onChange={(e) => {
            if (e.target.value === "__custom") {
              setCustom(true);
              onChange(null);
            } else {
              onChange(e.target.value || null);
            }
          }}
        >
          <option value="">Not set</option>
          {PROFILE_PURPOSE_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
          <option value="__custom">Something else…</option>
        </select>
      )}
    </div>
  );
}

function DraftFields({
  draft,
  setDraft,
  courseOptions,
}: {
  draft: ProfileInput;
  setDraft: (d: ProfileInput) => void;
  courseOptions: CourseOption[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-navy-900">Name</span>
        <input
          className={inputClass}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
placeholder="First name is fine"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-navy-900">Grade</span>
        <input
          className={inputClass}
          value={draft.grade ?? ""}
          onChange={(e) => setDraft({ ...draft, grade: e.target.value })}
          placeholder="e.g. 8th"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-navy-900">Math class right now</span>
        <input
          className={inputClass}
          value={draft.currentMathClass ?? ""}
          onChange={(e) => setDraft({ ...draft, currentMathClass: e.target.value })}
          placeholder="e.g. Algebra 1"
          list="course-options"
        />
      </label>

      {/* The diagnostic needs both classes to know what to cover (F6). */}
      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-navy-900">Math class before that</span>
        <input
          className={inputClass}
          value={draft.previousMathClass ?? ""}
          onChange={(e) => setDraft({ ...draft, previousMathClass: e.target.value })}
          placeholder="e.g. Pre-Algebra"
          list="course-options"
        />
      </label>

      <datalist id="course-options">
        {courseOptions.map((c) => (
          <option key={c.id} value={c.title} />
        ))}
      </datalist>

      <PurposeSelect
        label="Main reason"
        value={draft.primaryPurpose ?? null}
        onChange={(v) => setDraft({ ...draft, primaryPurpose: v })}
      />
      <PurposeSelect
        label="Also (optional)"
        value={draft.secondaryPurpose ?? null}
        onChange={(v) => setDraft({ ...draft, secondaryPurpose: v })}
      />
    </div>
  );
}

function CredentialsForm({ profile, onDone }: { profile: LearnerProfile; onDone: () => void }) {
  const [username, setUsername] = useState(profile.username ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function save() {
    setError(null);
    start(async () => {
      const result = profile.hasLogin && username === profile.username
        ? await resetStudentPassword({ profileId: profile.id, password })
        : await setStudentCredentials({ profileId: profile.id, username, password });

      if (!result.ok) {
        setError(result.message);
        return;
      }
      setPassword("");
      onDone();
      router.refresh();
    });
  }

  return (
    <div className="mt-4 rounded-lg border border-navy-100 bg-navy-50 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-navy-900">Username</span>
          <input
            className={inputClass}
            value={username}
            autoCapitalize="none"
            spellCheck={false}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="letters, numbers, dots or dashes"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-navy-900">
            {profile.hasLogin ? "New password" : "Password"}
          </span>
          <input
            className={inputClass}
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="at least 8 characters"
          />
        </label>
      </div>

      <p className="mt-3 text-sm text-navy-600">
        You&apos;ll need to tell this to your child yourself — we never email a student, so there is
        no way for them to reset it on their own. You can change it here any time.
      </p>

      {error && <p className="mt-3 text-sm text-[var(--error)]">{error}</p>}

      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save login"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-navy-600 hover:text-navy-900"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function LoginStatus({ profile }: { profile: LearnerProfile }) {
  if (!profile.hasLogin) {
    return <span className="text-sm text-navy-500">No login yet</span>;
  }
  if (!profile.loginActive) {
    return (
      <span className="rounded bg-[var(--warning-light)] px-2 py-0.5 text-xs font-semibold text-[#8a5a00]">
        Opens after your first purchase
      </span>
    );
  }
  return (
    <span className="rounded bg-[var(--success-light)] px-2 py-0.5 text-xs font-semibold text-[var(--success)]">
      Active · {profile.username}
    </span>
  );
}

function StudentRow({ profile, courseOptions }: { profile: LearnerProfile; courseOptions: CourseOption[] }) {
  const [editing, setEditing] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);
  const [draft, setDraft] = useState<ProfileInput>({
    name: profile.name,
    grade: profile.grade ?? "",
    currentMathClass: profile.currentMathClass ?? "",
    previousMathClass: profile.previousMathClass ?? "",
    primaryPurpose: profile.primaryPurpose,
    secondaryPurpose: profile.secondaryPurpose,
    currentCourseNode: profile.currentCourseNode,
  });
  const [pending, start] = useTransition();
  const router = useRouter();

  function save() {
    start(async () => {
      await updateProfile(profile.id, draft);
      setEditing(false);
      router.refresh();
    });
  }

  function revoke() {
    if (!confirm(`Turn off ${profile.name}'s login and stop collecting anything further from them?`)) return;
    start(async () => {
      await revokeConsentForStudent(profile.id);
      router.refresh();
    });
  }

  function remove() {
    if (!confirm(`Delete ${profile.name} and everything collected from them? This can't be undone.`)) return;
    start(async () => {
      await deleteStudent(profile.id);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-navy-100 bg-white p-6 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold text-navy-950">{profile.name}</p>
          <p className="mt-0.5 text-sm text-navy-600">
            {[profile.grade, profile.currentMathClass].filter(Boolean).join(" · ") || "No class set"}
          </p>
          {profile.primaryPurpose && (
            <p className="mt-1 text-sm text-navy-700">
              {labelFor(profile.primaryPurpose)}
              {profile.secondaryPurpose ? ` · ${labelFor(profile.secondaryPurpose)}` : ""}
            </p>
          )}
          <div className="mt-2">
            <LoginStatus profile={profile} />
          </div>
        </div>

        <div className="flex flex-wrap gap-3 text-sm font-semibold">
          <button type="button" onClick={() => setEditing((v) => !v)} className="text-navy-600 hover:text-navy-900">
            {editing ? "Close" : "Edit"}
          </button>
          <button
            type="button"
            onClick={() => setShowCredentials((v) => !v)}
            className="text-navy-600 hover:text-navy-900"
          >
            {profile.hasLogin ? "Change login" : "Set up login"}
          </button>
          {profile.loginActive && (
            <button type="button" onClick={revoke} disabled={pending} className="text-navy-600 hover:text-navy-900">
              Withdraw consent
            </button>
          )}
          <button type="button" onClick={remove} disabled={pending} className="text-[var(--error)] hover:underline">
            Delete
          </button>
        </div>
      </div>

      {editing && (
        <div className="mt-5 border-t border-navy-100 pt-5">
          <DraftFields draft={draft} setDraft={setDraft} courseOptions={courseOptions} />
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="mt-4 rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      )}

      {showCredentials && <CredentialsForm profile={profile} onDone={() => setShowCredentials(false)} />}
    </div>
  );
}

export function StudentManager({
  profiles,
  courseOptions,
}: {
  profiles: LearnerProfile[];
  courseOptions: CourseOption[];
}) {
  const [draft, setDraft] = useState<ProfileInput>(emptyDraft);
  const [adding, setAdding] = useState(profiles.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function add() {
    setError(null);
    start(async () => {
      const result = await createProfile(draft);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDraft(emptyDraft);
      setAdding(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {profiles.map((profile) => (
        <StudentRow key={profile.id} profile={profile} courseOptions={courseOptions} />
      ))}

      {adding ? (
        <div className="rounded-xl border border-navy-200 bg-white p-6">
          <p className="mb-4 text-lg font-bold text-navy-950">Add a student</p>
          <DraftFields draft={draft} setDraft={setDraft} courseOptions={courseOptions} />
          <p className="mt-4 text-sm text-navy-600">
            You&apos;ll set up their username and password after this, on their row.
          </p>
          {error && <p className="mt-3 text-sm text-[var(--error)]">{error}</p>}
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={add}
              disabled={pending}
              className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-60"
            >
              {pending ? "Adding…" : "Add student"}
            </button>
            {profiles.length > 0 && (
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-navy-600 hover:text-navy-900"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-xl border border-dashed border-navy-200 px-4 py-4 text-sm font-semibold text-navy-600 hover:border-navy-400 hover:text-navy-900"
        >
          + Add another student
        </button>
      )}
    </div>
  );
}
