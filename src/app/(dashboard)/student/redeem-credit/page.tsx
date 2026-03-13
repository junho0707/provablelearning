import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { findMakeupSessionsForCredit } from '@/lib/credits/find-sessions-for-credit';
import { CreditMakeupPicker } from '../../_components/credit-makeup-picker';
import type { GroupSizeType, Subject, CourseLevel } from '@/lib/types';
import Link from 'next/link';

export default async function StudentRedeemCreditPage({
  searchParams,
}: {
  searchParams: Promise<{ student_id?: string; group_size_type?: string; subject?: string; level?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const params = await searchParams;
  const { student_id, group_size_type, subject, level } = params;

  if (!student_id || !group_size_type) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">Redeem Credit</h1>
          <p className="text-slate-500">Use your credit to book a makeup session.</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-sm text-slate-500 mb-4">Missing required parameters.</p>
          <Link href="/student" className="text-sm font-medium text-navy-900 hover:text-navy-700">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Verify this student belongs to the authenticated user (independent student)
  const adminClient = createAdminClient();
  const { data: studentRow } = await adminClient
    .from('students')
    .select('id, user_id, parent_id')
    .eq('id', student_id)
    .eq('user_id', user.id)
    .single();

  if (!studentRow || studentRow.parent_id) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">Redeem Credit</h1>
          <p className="text-slate-500">Use your credit to book a makeup session.</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-sm text-slate-500 mb-4">Student not found or not authorized.</p>
          <Link href="/student" className="text-sm font-medium text-navy-900 hover:text-navy-700">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const result = await findMakeupSessionsForCredit(
    student_id,
    group_size_type as GroupSizeType,
    (subject as Subject) || null,
    (level as CourseLevel) || null
  );

  if (result.error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">Redeem Credit</h1>
          <p className="text-slate-500">Use your credit to book a makeup session.</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-sm text-slate-500 mb-4">{result.error}</p>
          <Link href="/student" className="text-sm font-medium text-navy-900 hover:text-navy-700">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">Redeem Credit</h1>
        <p className="text-slate-500">
          {subject ? `${subject.replace('_', ' ')} — ` : ''}{level ? `${level} — ` : ''}{group_size_type.replace('_', ' ')}
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <CreditMakeupPicker
          studentId={student_id}
          sessions={result.sessions || []}
          basePath="/student"
        />
      </div>
    </div>
  );
}
