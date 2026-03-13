import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ReviewForm } from './review-form';

export default async function AdminRefundRequestsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: requests } = await supabase
    .from('refund_requests')
    .select('*, users!refund_requests_parent_id_fkey(full_name)')
    .order('created_at', { ascending: false });

  // Get enrollment details for each request
  const enrollmentIds = (requests || []).map((r) => r.enrollment_id);
  let enrollmentMap: Record<string, Record<string, unknown>> = {};
  if (enrollmentIds.length > 0) {
    const { data: enrollments } = await supabase
      .from('enrollments')
      .select('id, status, stripe_session_id, credits_applied, credits_group_size_type, classes!class_id(name, group_size_type, meeting_day)')
      .in('id', enrollmentIds);

    enrollmentMap = Object.fromEntries(
      (enrollments || []).map((e) => [e.id, e as Record<string, unknown>])
    );
  }

  const pending = (requests || []).filter((r) => r.status === 'pending');
  const resolved = (requests || []).filter((r) => r.status !== 'pending');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">Refund Requests</h1>
        <p className="text-slate-500">Review and process parent refund cases.</p>
      </div>

      {pending.length === 0 && (
        <p className="text-slate-500 mb-6">No pending refund requests.</p>
      )}

      {pending.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-navy-900 mb-4">Pending ({pending.length})</h2>
          <div className="space-y-4">
            {pending.map((req) => {
              const parentObj = req.users as unknown as
                | Record<string, string>
                | Record<string, string>[];
              const parentName = Array.isArray(parentObj)
                ? parentObj[0]?.full_name
                : parentObj?.full_name;
              const enrollment = enrollmentMap[req.enrollment_id] || {};
              const cls = enrollment.classes as Record<string, string> | undefined;

              return (
                <div key={req.id} className="border border-slate-200 rounded-xl p-4 sm:p-6">
                  <div className="flex flex-col gap-2 mb-3 sm:flex-row sm:justify-between sm:items-start">
                    <div>
                      <p className="font-medium">{parentName || 'Unknown Parent'}</p>
                      <p className="text-sm text-slate-600">
                        {cls?.name || 'Unknown class'} — {cls?.meeting_day || ''}{' '}
                        ({(cls?.group_size_type || '').replace('_', ' ')})
                      </p>
                      <p className="text-sm text-slate-500">
                        Enrollment status: {(enrollment.status as string) || 'unknown'}
                      </p>
                    </div>
                    <p className="text-xs text-slate-400">
                      {new Date(req.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <p className="text-sm bg-slate-50 rounded p-3 mb-4">{req.reason}</p>
                  <ReviewForm
                    requestId={req.id}
                    stripeSessionId={(enrollment.stripe_session_id as string) || null}
                    creditsApplied={(enrollment.credits_applied as number) || null}
                    groupSizeType={(enrollment.credits_group_size_type as string) || (cls?.group_size_type as string) || null}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {resolved.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-navy-900 mb-4">Resolved</h2>
          <div className="space-y-3">
            {resolved.map((req) => {
              const parentObj = req.users as unknown as
                | Record<string, string>
                | Record<string, string>[];
              const parentName = Array.isArray(parentObj)
                ? parentObj[0]?.full_name
                : parentObj?.full_name;

              return (
                <div key={req.id} className="border rounded p-4 opacity-75">
                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-start">
                    <div>
                      <p className="text-sm font-medium">{parentName}</p>
                      <p className="text-sm text-slate-600">{req.reason}</p>
                      {req.admin_notes && (
                        <p className="text-sm text-slate-500 mt-1">Notes: {req.admin_notes}</p>
                      )}
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded capitalize ${
                        req.status === 'approved'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {req.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
