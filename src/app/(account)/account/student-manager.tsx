"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProfile, updateProfile } from "@/lib/accounts/profiles";
import { setStudentCredentials, resetStudentPassword } from "@/lib/accounts/student-credentials";
import { revokeConsentForStudent, deleteStudent } from "@/lib/accounts/consent";
import { PROFILE_PURPOSE_PRESETS, labelFor } from "@/lib/accounts/purposes";
import type { LearnerProfile, ProfileInput } from "@/lib/accounts/types";
import { BTN, BTN_QUIET, H3, INPUT, LABEL, NOTICE_ERROR } from "@/lib/ui";

/**
 * Students, their credentials, and the consent controls that must sit beside them
 * (`system/03-FLOWS.md` F2 and F13).
 *
 * Credentials and consent are shown on the same row as the student deliberately: a parent asking
 * "what does my child have access to" should not have to assemble the answer from three screens.
 *
 * One student is one row of a hairline-divided list, matching the dashboard and the landing's
 * grids. What a row reveals — the edit fields, the login form — opens *inside* the row, boxed by a
 * hairline, so it is visibly part of that student rather than a card that appeared beneath them.
 */

type CourseOption = { id: string; title: string };

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
      <span className={LABEL}>{label}</span>
      {custom ? (
        <div className="flex gap-2">
          <input
            className={INPUT}
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
            className={`whitespace-nowrap ${BTN_QUIET}`}
          >
            Pick one
          </button>
        </div>
      ) : (
        // `appearance-none` plus our own chevron: the native control paints its arrow hard against
        // the right border, which reads as clipped next to the plain inputs beside it.
        <div className="relative">
          <select
            className={`${INPUT} appearance-none pr-9`}
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
          <svg
            aria-hidden="true"
            viewBox="0 0 12 12"
            className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 text-navy-950/40"
          >
            <path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
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
        <span className={LABEL}>Name</span>
        <input
          className={INPUT}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="First name is fine"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className={LABEL}>Grade</span>
        <input
          className={INPUT}
          value={draft.grade ?? ""}
          onChange={(e) => setDraft({ ...draft, grade: e.target.value })}
          placeholder="e.g. 8th"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className={LABEL}>Current math class</span>
        <input
          className={INPUT}
          value={draft.currentMathClass ?? ""}
          onChange={(e) => setDraft({ ...draft, currentMathClass: e.target.value })}
          placeholder="e.g. Algebra 1"
          list="course-options"
        />
      </label>

      {/* The diagnostic needs both classes to know what to cover (F6). */}
      <label className="flex flex-col gap-2">
        <span className={LABEL}>Previous math class</span>
        <input
          className={INPUT}
          value={draft.previousMathClass ?? ""}
          onChange={(e) => setDraft({ ...draft, previousMathClass: e.target.value })}
          placeholder="e.g. Pre-Algebra"
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
    <div className="mt-5 border border-navy-950/10 bg-white p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className={LABEL}>Username</span>
          <input
            className={INPUT}
            value={username}
            autoCapitalize="none"
            spellCheck={false}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="letters, numbers, dots or dashes"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className={LABEL}>{profile.hasLogin ? "New password" : "Password"}</span>
          <input
            className={INPUT}
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="at least 8 characters"
          />
        </label>
      </div>

      <p className="mt-4 text-[0.875rem] leading-relaxed text-navy-700">
        You&apos;ll need to tell this to your child yourself — we never email a student, so there is
        no way for them to reset it on their own. You can change it here any time.
      </p>

      {error && (
        <p role="alert" className={`mt-4 ${NOTICE_ERROR}`}>
          {error}
        </p>
      )}

      <div className="mt-5 flex items-center gap-5">
        <button type="button" onClick={save} disabled={pending} className={BTN}>
          {pending ? "Saving…" : "Save login"}
        </button>
        <button type="button" onClick={onDone} className={BTN_QUIET}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * Square, not a pill: the tinted rounded badge was the last rounded thing on the page. The tint
 * carries the state and a left rule carries the emphasis, the same way the notices do.
 */
function LoginStatus({ profile }: { profile: LearnerProfile }) {
  if (!profile.hasLogin) {
    return <span className="text-[0.875rem] text-navy-950/45">No login yet</span>;
  }
  if (!profile.loginActive) {
    return (
      <span className="border-l-2 border-[var(--warning)] bg-[var(--warning-light)] px-2 py-0.5 text-[0.75rem] font-semibold text-[#8a5a00]">
        Sign-in opens after your first purchase
      </span>
    );
  }
  return (
    <span className="border-l-2 border-[var(--success)] bg-[var(--success-light)] px-2 py-0.5 text-[0.75rem] font-semibold text-[var(--success)]">
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
    <div className="border-b border-navy-950/10 py-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className={H3}>{profile.name}</p>
          <p className="mt-1 text-[0.875rem] text-navy-700">
            {[profile.grade, profile.currentMathClass].filter(Boolean).join(" · ") || "No class set"}
          </p>
          {profile.primaryPurpose && (
            <p className="mt-0.5 text-[0.875rem] text-navy-950/45">
              {labelFor(profile.primaryPurpose)}
              {profile.secondaryPurpose ? ` · ${labelFor(profile.secondaryPurpose)}` : ""}
            </p>
          )}
          <div className="mt-3">
            <LoginStatus profile={profile} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-5">
          <button type="button" onClick={() => setEditing((v) => !v)} className={BTN_QUIET}>
            {editing ? "Close" : "Edit"}
          </button>
          <button type="button" onClick={() => setShowCredentials((v) => !v)} className={BTN_QUIET}>
            {profile.hasLogin ? "Change login" : "Set up login"}
          </button>
          {profile.loginActive && (
            <button type="button" onClick={revoke} disabled={pending} className={BTN_QUIET}>
              Withdraw consent
            </button>
          )}
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="text-[0.875rem] font-semibold text-[var(--error)] hover:underline disabled:opacity-40"
          >
            Delete
          </button>
        </div>
      </div>

      {editing && (
        <div className="mt-5 border border-navy-950/10 bg-white p-5">
          <DraftFields draft={draft} setDraft={setDraft} courseOptions={courseOptions} />
          <button type="button" onClick={save} disabled={pending} className={`mt-5 ${BTN}`}>
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
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [adding, setAdding] = useState(profiles.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function add() {
    setError(null);
    if (!username.trim() || !password) {
      return setError("Pick a username and password for them — they need a sign-in to do anything.");
    }

    start(async () => {
      const result = await createProfile(draft);
      if (!result.ok) {
        setError(result.message);
        return;
      }

      // A student with no sign-in can do nothing at all, so adding one is not two steps that can
      // half-succeed. If the username is taken, the half-made student is removed and the form
      // stays open on what the parent typed, rather than leaving a row they have to go finish.
      const credentials = await setStudentCredentials({
        profileId: result.profile.id,
        username,
        password,
      });
      if (!credentials.ok) {
        await deleteStudent(result.profile.id);
        setError(credentials.message);
        return;
      }

      setDraft(emptyDraft);
      setUsername("");
      setPassword("");
      setAdding(false);
      // A new student's next step is booking them a session, which lives on the dashboard.
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <div className="border-t border-navy-950/10">
      {profiles.map((profile) => (
        <StudentRow key={profile.id} profile={profile} courseOptions={courseOptions} />
      ))}

      {adding ? (
        <div className="mt-7 border border-navy-950/10 bg-white p-6">
          <p className={`mb-5 ${H3}`}>Add a student</p>
          <DraftFields draft={draft} setDraft={setDraft} courseOptions={courseOptions} />

          <div className="mt-6 border-t border-navy-950/10 pt-6">
            <p className="text-[0.9375rem] font-semibold text-navy-950">Their sign-in</p>
            <p className="mt-1.5 max-w-[68ch] text-[0.875rem] leading-relaxed text-navy-700">
              Make up a username and password for them. We never email a student, so passing it on
              is down to you.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className={LABEL}>Username</span>
                <input
                  className={INPUT}
                  value={username}
                  autoCapitalize="none"
                  spellCheck={false}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="letters, numbers, dots or dashes"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className={LABEL}>Password</span>
                <input
                  className={INPUT}
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="at least 8 characters"
                />
              </label>
            </div>
          </div>

          {error && (
            <p role="alert" className={`mt-4 ${NOTICE_ERROR}`}>
              {error}
            </p>
          )}
          <div className="mt-5 flex items-center gap-5">
            <button type="button" onClick={add} disabled={pending} className={BTN}>
              {pending ? "Adding…" : "Add student"}
            </button>
            {profiles.length > 0 && (
              <button type="button" onClick={() => setAdding(false)} className={BTN_QUIET}>
                Cancel
              </button>
            )}
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className={`mt-6 ${BTN_QUIET}`}>
          + Add another student
        </button>
      )}
    </div>
  );
}
