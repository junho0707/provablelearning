'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { logPerformance } from './actions';

interface ClassItem {
  id: string;
  name: string | null;
  subject: string | null;
  level: string | null;
  group_size_type: string;
  meeting_day: string;
  meeting_time: string;
}

interface StudentEntry {
  student_id: string;
  student_name: string;
  attendance: boolean;
  homework_completed: boolean;
  notes: string;
}

export default function PerformanceForm({ classes }: { classes: ClassItem[] }) {
  const [selectedClass, setSelectedClass] = useState('');
  const [sessionNumber, setSessionNumber] = useState(1);
  const [weekNumber, setWeekNumber] = useState(1);
  const [entries, setEntries] = useState<StudentEntry[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!selectedClass) {
      setEntries([]);
      return;
    }

    const supabase = createClient();

    // Fetch enrolled students, existing performance logs, makeup students, AND session cancellations
    Promise.all([
      supabase
        .from('enrollments')
        .select('student_id, students(id, users!students_user_id_fkey(full_name))')
        .or(`slot_1_class_id.eq.${selectedClass},slot_2_class_id.eq.${selectedClass},class_id.eq.${selectedClass}`)
        .eq('status', 'active'),
      supabase
        .from('performance_logs')
        .select('student_id, attendance, homework_completed, notes')
        .eq('class_id', selectedClass)
        .eq('session_number', sessionNumber),
      supabase
        .from('makeup_bookings')
        .select('student_id, students(id, users!students_user_id_fkey(full_name))')
        .eq('host_class_id', selectedClass)
        .eq('session_number', sessionNumber)
        .in('status', ['booked', 'attended']),
      // Fetch cancellations for this class+session to exclude students who cancelled
      supabase
        .from('session_cancellations')
        .select('student_id, status')
        .eq('class_id', selectedClass)
        .eq('session_number', sessionNumber)
        .in('status', ['cancelled', 'absent']),
    ]).then(([enrollRes, logsRes, makeupRes, cancelRes]) => {
      const enrollments = enrollRes.data || [];
      const logs = logsRes.data || [];
      const makeups = makeupRes.data || [];
      const cancellations = cancelRes.data || [];

      // Students who cancelled this specific session
      const cancelledStudentIds = new Set(
        cancellations.map((c: Record<string, unknown>) => c.student_id as string)
      );

      const logsByStudent = new Map(
        logs.map((l: Record<string, unknown>) => [l.student_id as string, l])
      );

      const enrolledIds = new Set(enrollments.map((e: Record<string, unknown>) => e.student_id as string));

      // Filter out students who cancelled this session
      const enrolledEntries = enrollments
        .filter((e: Record<string, unknown>) => !cancelledStudentIds.has(e.student_id as string))
        .map((e: Record<string, unknown>) => {
          const studentId = e.student_id as string;
          const existing = logsByStudent.get(studentId) as Record<string, unknown> | undefined;
          return {
            student_id: studentId,
            student_name:
              ((e.students as Record<string, unknown>)?.users as Record<string, string>)?.full_name || 'Unknown',
            attendance: existing ? (existing.attendance as boolean) : false,
            homework_completed: existing ? (existing.homework_completed as boolean) : false,
            notes: existing ? ((existing.notes as string) || '') : '',
          };
        });

      const makeupEntries = (makeups as Record<string, unknown>[])
        .filter((m) => !enrolledIds.has(m.student_id as string))
        .map((m) => {
          const studentId = m.student_id as string;
          const existing = logsByStudent.get(studentId) as Record<string, unknown> | undefined;
          const name =
            ((m.students as Record<string, unknown>)?.users as Record<string, string>)?.full_name || 'Unknown';
          return {
            student_id: studentId,
            student_name: `${name} (makeup)`,
            attendance: existing ? (existing.attendance as boolean) : false,
            homework_completed: existing ? (existing.homework_completed as boolean) : false,
            notes: existing ? ((existing.notes as string) || '') : '',
          };
        });

      setEntries([...enrolledEntries, ...makeupEntries]);
    });
  }, [selectedClass, sessionNumber, classes]);

  async function handleSubmit() {
    if (!selectedClass) return;
    setError('');
    setSuccess('');

    const result = await logPerformance({
      classId: selectedClass,
      weekNumber,
      sessionNumber,
      entries,
    });

    if (result?.error) setError(result.error);
    else setSuccess('Performance logged successfully.');
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-error text-sm">{error}</p>}
      {success && <p className="text-green-600 text-sm">{success}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        <div>
          <label className="block text-sm font-medium mb-1">Class</label>
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="w-full rounded border px-3 py-2"
          >
            <option value="">Select class</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || 'Unnamed'} — {(c.group_size_type || '').replace('_', ' ')} ({c.meeting_day} {c.meeting_time})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Week</label>
          <select value={weekNumber} onChange={(e) => setWeekNumber(Number(e.target.value))} className="w-full rounded border px-3 py-2">
            {[1, 2, 3, 4].map((w) => <option key={w} value={w}>Week {w}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Session</label>
          <select value={sessionNumber} onChange={(e) => setSessionNumber(Number(e.target.value))} className="w-full rounded border px-3 py-2">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => <option key={s} value={s}>Session {s}</option>)}
          </select>
        </div>
      </div>

      {entries.length > 0 && (
        <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full min-w-[450px] text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Student</th>
                <th className="text-center px-4 py-3 font-medium">Present</th>
                <th className="text-center px-4 py-3 font-medium">HW Done</th>
                <th className="text-left px-4 py-3 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {entries.map((entry, i) => (
                <tr key={entry.student_id}>
                  <td className="px-4 py-3">{entry.student_name}</td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={entry.attendance}
                      onChange={(e) => {
                        const updated = [...entries];
                        updated[i] = { ...updated[i], attendance: e.target.checked };
                        setEntries(updated);
                      }}
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={entry.homework_completed}
                      onChange={(e) => {
                        const updated = [...entries];
                        updated[i] = { ...updated[i], homework_completed: e.target.checked };
                        setEntries(updated);
                      }}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      value={entry.notes}
                      onChange={(e) => {
                        const updated = [...entries];
                        updated[i] = { ...updated[i], notes: e.target.value };
                        setEntries(updated);
                      }}
                      className="w-full rounded border px-2 py-1 text-sm"
                      placeholder="Optional notes"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {entries.length > 0 && (
        <button
          onClick={handleSubmit}
          className="rounded bg-navy-900 px-6 py-2 text-white font-medium hover:bg-navy-800"
        >
          Save Performance Logs
        </button>
      )}
    </div>
  );
}
