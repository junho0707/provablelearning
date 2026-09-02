"use client";

import { useState } from "react";
import { getOrCreateAssessment } from "@/lib/assessment/session";
import { StrengthsAssessment } from "./strengths-assessment";
import { TestPrepFlow } from "./test-prep-flow";
import { SessionBooking } from "./session-booking";

type Profile = { id: string; name: string };
type Goal = "strengths" | "test_prep" | "class_help";

export function FirstSessionFlow({
  purchaseId,
  goal,
  profiles,
  slots,
}: {
  purchaseId: string;
  goal: Goal;
  profiles: Profile[];
  slots: string[];
}) {
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "");
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [chosenTestSlug, setChosenTestSlug] = useState("sat");
  const [assessmentDone, setAssessmentDone] = useState(goal === "class_help");
  const [floorSummary, setFloorSummary] = useState<string[] | null>(null);

  if (profiles.length === 0) {
    return <p className="text-sm text-navy-600">Add a learner profile on the profiles page first.</p>;
  }

  if (!assessmentDone) {
    if (goal === "strengths") {
      if (!assessmentId) {
        return (
          <ProfilePicker
            profiles={profiles}
            profileId={profileId}
            setProfileId={setProfileId}
            onContinue={async () => {
              const a = await getOrCreateAssessment(purchaseId, profileId, "strengths", null);
              if (a) setAssessmentId(a.id);
            }}
          />
        );
      }
      return (
        <StrengthsAssessment
          assessmentId={assessmentId}
          onDone={(floor) => {
            setFloorSummary(floor);
            setAssessmentDone(true);
          }}
        />
      );
    }

    if (goal === "test_prep") {
      if (!assessmentId) {
        return (
          <ProfilePicker
            profiles={profiles}
            profileId={profileId}
            setProfileId={setProfileId}
            testPicker
            onContinue={async (testSlug) => {
              const slug = testSlug ?? "sat";
              const a = await getOrCreateAssessment(purchaseId, profileId, "test_prep", slug);
              if (a) {
                setChosenTestSlug(slug);
                setAssessmentId(a.id);
              }
            }}
          />
        );
      }
      return <TestPrepFlow assessmentId={assessmentId} testSlug={chosenTestSlug} onDone={() => setAssessmentDone(true)} />;
    }
  }

  return (
    <div>
      {floorSummary && floorSummary.length > 0 && (
        <div className="mb-6 rounded-lg border border-navy-100 bg-navy-50 p-4 text-sm text-navy-700">
          <p className="font-semibold text-navy-900">What we&apos;ll focus on</p>
          <p className="mt-1">Strongest starting points found near: {floorSummary.join(", ")}.</p>
        </div>
      )}
      <p className="mb-4 text-sm text-navy-700">Now let&apos;s get your session on the calendar.</p>
      <SessionBooking purchaseId={purchaseId} profileId={profileId} slots={slots} />
    </div>
  );
}

function ProfilePicker({
  profiles,
  profileId,
  setProfileId,
  onContinue,
  testPicker,
}: {
  profiles: Profile[];
  profileId: string;
  setProfileId: (id: string) => void;
  onContinue: (testSlug?: string) => void;
  testPicker?: boolean;
}) {
  const [testSlug, setTestSlug] = useState("sat");
  return (
    <div className="space-y-4">
      {profiles.length > 1 && (
        <select value={profileId} onChange={(e) => setProfileId(e.target.value)} className="rounded-lg border border-navy-200 px-3 py-2 text-sm">
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
      {testPicker && (
        <select value={testSlug} onChange={(e) => setTestSlug(e.target.value)} className="rounded-lg border border-navy-200 px-3 py-2 text-sm">
          <option value="sat">SAT</option>
          <option value="act">ACT</option>
        </select>
      )}
      <button
        onClick={() => onContinue(testPicker ? testSlug : undefined)}
        className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white"
      >
        Continue
      </button>
    </div>
  );
}
