'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cancelSession } from '@/lib/cancellation/cancel-session';

export interface CancellableSession {
  enrollmentId: string;
  studentName: string;
  courseName: string;
  sessionNumber: number;
  sessionDate: string; // YYYY-MM-DD
  groupSizeType: string;
  meetingTime: string;
}

interface Props {
  sessions: CancellableSession[];
  rescheduleBasePath: string;
}

export function CancelSessionForm({ sessions, rescheduleBasePath }: Props) {
  const router = useRouter();
  const [selectedKey, setSelectedKey] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{
    cancellationId: string;
    groupSizeType: string;
    courseName: string;
    sessionNumber: number;
    sessionDate: string;
    meetingTime: string;
    studentName: string;
  } | null>(null);

  // Group sessions by student
  const byStudent = sessions.reduce<Record<string, CancellableSession[]>>((acc, s) => {
    if (!acc[s.studentName]) acc[s.studentName] = [];
    acc[s.studentName].push(s);
    return acc;
  }, {});

  const selectedSession = sessions.find(
    (s) => `${s.enrollmentId}:${s.sessionNumber}` === selectedKey
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSession) return;

    setSubmitting(true);
    setError('');

    const result = await cancelSession(
      selectedSession.enrollmentId,
      selectedSession.sessionNumber,
      reason.trim() || undefined
    );

    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    if (result.groupSizeType === 'one_on_one' && result.cancellationId) {
      // Redirect to reschedule
      router.push(`${rescheduleBasePath}/reschedule?cancellation_id=${result.cancellationId}`);
      return;
    }

    setSuccess({
      cancellationId: result.cancellationId!,
      groupSizeType: result.groupSizeType!,
      courseName: selectedSession.courseName,
      sessionNumber: selectedSession.sessionNumber,
      sessionDate: selectedSession.sessionDate,
      meetingTime: selectedSession.meetingTime,
      studentName: selectedSession.studentName,
    });
    setSubmitting(false);
  }

  if (success) {
    const showAlternateButton = ['small', 'medium', 'large'].includes(success.groupSizeType);

    return (
      <div className="border rounded-lg p-6">
        <div className="text-center">
          <div className="text-4xl mb-4">&#10003;</div>
          <h2 className="text-xl font-semibold mb-2">Session Cancelled</h2>
          <div className="mb-3 bg-gray-50 rounded p-3 text-sm">
            <p className="font-medium">{success.studentName} — {success.courseName}</p>
            <p className="text-gray-500">Session {success.sessionNumber} on {success.sessionDate} at {success.meetingTime}</p>
          </div>
          {success.groupSizeType === 'small' || success.groupSizeType === 'medium' ? (
            <p className="text-gray-600">
              If not made up by the end of the week of the missed session (Sunday 11:59 PM), a makeup credit will be auto-issued.
            </p>
          ) : success.groupSizeType === 'large' ? (
            <p className="text-gray-600">
              You may join an alternate session this week. No credit will be issued.
            </p>
          ) : success.groupSizeType === 'one_on_one' ? (
            <p className="text-gray-600">Redirecting to reschedule...</p>
          ) : (
            <p className="text-gray-600">Cancellation recorded.</p>
          )}
          <div className="mt-4 flex flex-col gap-2 items-center">
            {showAlternateButton && (
              <button
                onClick={() =>
                  router.push(
                    `${rescheduleBasePath}/alternate?cancellation_id=${success.cancellationId}`
                  )
                }
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                {success.groupSizeType === 'large' ? 'Find Alternate Session' : 'Find Makeup Session'}
              </button>
            )}
            <button
              onClick={() => {
                setSuccess(null);
                setSelectedKey('');
                setReason('');
              }}
              className="rounded border px-4 py-2 text-sm font-medium hover:bg-gray-50"
            >
              Cancel Another Session
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="border rounded-lg p-6 space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Select Session to Cancel</label>
        <select
          value={selectedKey}
          onChange={(e) => setSelectedKey(e.target.value)}
          required
          className="w-full rounded border px-3 py-2 text-sm"
        >
          <option value="">Choose a session...</option>
          {Object.entries(byStudent).map(([studentName, studentSessions]) => (
            <optgroup key={studentName} label={studentName}>
              {studentSessions.map((s) => (
                <option
                  key={`${s.enrollmentId}:${s.sessionNumber}`}
                  value={`${s.enrollmentId}:${s.sessionNumber}`}
                >
                  {s.courseName} — Session {s.sessionNumber} ({s.sessionDate}, {s.meetingTime})
                  {s.groupSizeType === 'one_on_one' ? ' [1:1 — will reschedule]' : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {selectedSession && (
        <div className="bg-gray-50 rounded p-3 text-sm">
          <p>
            <span className="font-medium">{selectedSession.studentName}</span> —{' '}
            {selectedSession.courseName}
          </p>
          <p className="text-gray-500">
            Session {selectedSession.sessionNumber} on {selectedSession.sessionDate} at{' '}
            {selectedSession.meetingTime}
          </p>
          <p className="text-gray-500">
            Group: {selectedSession.groupSizeType.replace('_', ' ')}
          </p>
          {selectedSession.groupSizeType === 'one_on_one' && (
            <p className="text-blue-600 mt-1">
              After cancelling, you will be directed to reschedule.
            </p>
          )}
          {(selectedSession.groupSizeType === 'small' ||
            selectedSession.groupSizeType === 'medium') && (
            <p className="text-amber-600 mt-1">
              If not made up by the end of the week of the missed session (Sunday 11:59 PM), a makeup credit will be auto-issued.
            </p>
          )}
          {selectedSession.groupSizeType === 'large' && (
            <p className="text-gray-500 mt-1">
              You may join an alternate session this week. No credit will be issued.
            </p>
          )}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">
          Reason <span className="text-gray-400">(optional)</span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          className="w-full rounded border px-3 py-2 text-sm"
          placeholder="Why are you cancelling this session?"
        />
      </div>

      <button
        type="submit"
        disabled={submitting || !selectedKey}
        className="w-full rounded bg-black px-4 py-3 text-white font-medium hover:bg-gray-800 disabled:opacity-50"
      >
        {submitting ? 'Cancelling...' : 'Cancel Session'}
      </button>
    </form>
  );
}
