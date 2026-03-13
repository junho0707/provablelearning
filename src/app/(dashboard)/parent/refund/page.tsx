import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function ParentRefundPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">Refunds</h1>
        <p className="text-slate-500">Request a refund for a paid enrollment.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <p className="text-sm text-slate-600 mb-4">
          Refund requests are handled on a case-by-case basis. To discuss a refund, please
          schedule a consultation with our team.
        </p>
        <Link
          href="/book"
          className="inline-block rounded-lg bg-navy-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-navy-800 transition-colors"
        >
          Schedule a Consultation
        </Link>
      </div>
    </div>
  );
}
