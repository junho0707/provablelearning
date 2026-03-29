import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { formatSubjectCategory, formatTime, getPriceForEnrollment } from '@/lib/constants';
import { PayNowButton } from '../../_components/pay-now-button';

const GROUP_SIZE_LABELS: Record<string, string> = {
  one_on_one: '1-on-1',
  small: 'Small Group',
  large: 'Large Group',
};

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  pending: 'bg-amber-100 text-amber-800',
  completed: 'bg-slate-100 text-slate-600',
  canceled: 'bg-red-100 text-red-700',
  refunded: 'bg-purple-100 text-purple-700',
};

const PAYMENT_STYLES: Record<string, string> = {
  paid: 'bg-green-100 text-green-800',
  unpaid: 'bg-amber-100 text-amber-800',
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso + (iso.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default async function ParentPaymentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const adminClient = createAdminClient();

  // Get children
  const { data: children } = await adminClient
    .from('students')
    .select('id, user_id, users!students_user_id_fkey(full_name)')
    .eq('parent_id', user.id);

  if (!children || children.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-navy-900">Payment History</h1>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-slate-500">No students linked to your account.</p>
        </div>
      </div>
    );
  }

  const studentIds = children.map((c) => c.id as string);

  // Fetch all enrollments (all statuses) for these students
  const { data: enrollments } = await adminClient
    .from('enrollments')
    .select('id, student_id, class_id, slot_1_class_id, slot_2_class_id, status, payment_status, payment_deadline, stripe_session_id, subject_category, subject_detail, student_start_date, student_end_date, created_at')
    .in('student_id', studentIds)
    .order('created_at', { ascending: false });

  // Fetch class info for slot_1 classes
  const classIds = [...new Set((enrollments || []).map((e) => (e.slot_1_class_id || e.class_id) as string).filter(Boolean))];
  let classMap: Record<string, { name: string; group_size_type: string; meeting_day: string; meeting_time: string }> = {};
  if (classIds.length > 0) {
    const { data: classes } = await adminClient
      .from('classes')
      .select('id, name, group_size_type, meeting_day, meeting_time')
      .in('id', classIds);
    for (const c of classes || []) {
      classMap[c.id] = c;
    }
  }

  // Fetch refund requests for these enrollments
  const enrollmentIds = (enrollments || []).map((e) => e.id as string);
  let refundMap: Record<string, { status: string; refund_type: string | null; created_at: string }> = {};
  if (enrollmentIds.length > 0) {
    const { data: refunds } = await adminClient
      .from('refund_requests')
      .select('enrollment_id, status, refund_type, created_at')
      .in('enrollment_id', enrollmentIds);
    for (const r of refunds || []) {
      refundMap[r.enrollment_id as string] = r as { status: string; refund_type: string | null; created_at: string };
    }
  }

  // Build student name map
  const studentNameMap: Record<string, string> = {};
  for (const c of children) {
    const userObj = (c as Record<string, unknown>).users as unknown as
      | { full_name: string }
      | { full_name: string }[];
    const name = Array.isArray(userObj) ? userObj[0]?.full_name : userObj?.full_name;
    studentNameMap[c.id as string] = name || 'Unknown';
  }

  const rows = (enrollments || []).map((e) => {
    const cls = classMap[(e.slot_1_class_id || e.class_id) as string];
    const groupSize = cls?.group_size_type || 'small';
    const amount = getPriceForEnrollment(groupSize);
    const refund = refundMap[e.id as string];
    return { ...e, cls, groupSize, amount, refund, studentName: studentNameMap[e.student_id as string] || 'Unknown' };
  });

  const totalPaid = rows.filter((r) => r.payment_status === 'paid' && r.status !== 'refunded').reduce((s, r) => s + r.amount, 0);
  const pendingPayments = rows.filter((r) => r.payment_status === 'unpaid' && r.status === 'active');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">Payment History</h1>
        <p className="text-slate-500">View your enrollment payments and billing details.</p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Total Paid</p>
          <p className="mt-1 text-2xl font-bold text-navy-900">{formatCents(totalPaid)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Active Enrollments</p>
          <p className="mt-1 text-2xl font-bold text-navy-900">{rows.filter((r) => r.status === 'active').length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Pending Payments</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{pendingPayments.length}</p>
        </div>
      </div>

      {/* Pending payments alert */}
      {pendingPayments.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="font-medium text-amber-800">You have {pendingPayments.length} unpaid enrollment{pendingPayments.length > 1 ? 's' : ''}.</p>
          <p className="mt-1 text-sm text-amber-700">
            Pay before the deadline to keep your seat.
          </p>
          <div className="mt-3 space-y-2">
            {pendingPayments.map((r) => (
              <div key={r.id as string} className="flex items-center justify-between rounded-lg bg-white/70 px-4 py-2.5">
                <div className="text-sm">
                  <span className="font-medium text-navy-900">{r.studentName}</span>
                  <span className="mx-1.5 text-slate-400">·</span>
                  <span className="text-slate-700">{GROUP_SIZE_LABELS[r.groupSize] || r.groupSize}</span>
                  {r.cls && (
                    <span className="text-slate-500"> — {r.cls.meeting_day} {formatTime(r.cls.meeting_time)}</span>
                  )}
                  {r.subject_category && (
                    <span className="text-slate-500"> — {formatSubjectCategory(r.subject_category as string | null, r.subject_detail as string | null)}</span>
                  )}
                  {r.payment_deadline && (
                    <span className="ml-2 text-xs text-amber-600">Due {formatDate(r.payment_deadline as string)}</span>
                  )}
                </div>
                <PayNowButton enrollmentId={r.id as string} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Enrollments table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="bg-navy-900 px-4 py-3 text-sm font-semibold text-white">All Enrollments</div>
        {rows.length === 0 ? (
          <p className="p-6 text-slate-500">No enrollments found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Class</th>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Deadline</th>
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3">Enrolled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id as string} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-navy-900">{r.studentName}</td>
                    <td className="px-4 py-3">
                      <span className="text-navy-800">{GROUP_SIZE_LABELS[r.groupSize] || r.groupSize}</span>
                      {r.cls && (
                        <span className="block text-xs text-slate-400">
                          {r.cls.meeting_day} {formatTime(r.cls.meeting_time)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatSubjectCategory(r.subject_category as string | null, r.subject_detail as string | null) || '—'}
                    </td>
                    <td className="px-4 py-3 font-medium text-navy-900">{formatCents(r.amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status as string] || 'bg-slate-100 text-slate-600'}`}>
                        {r.status as string}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${PAYMENT_STYLES[r.payment_status as string] || ''}`}>
                        {r.payment_status as string}
                      </span>
                      {r.refund && (
                        <span className="mt-1 block text-xs text-purple-600">
                          Refund: {r.refund.status}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {r.payment_status === 'unpaid' && r.payment_deadline
                        ? formatDate(r.payment_deadline as string)
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {r.student_start_date ? formatDate(r.student_start_date as string) : '—'}
                      {r.student_end_date ? ` → ${formatDate(r.student_end_date as string)}` : ''}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{formatDate(r.created_at as string)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
