import Link from 'next/link';

export default function EnrollCancelPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">Enrollment Canceled</h1>
        <p className="text-slate-500">Your payment was not completed.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
        <p className="text-slate-600 mb-6">
          Your reserved seat will be released shortly. You can try enrolling again.
        </p>
        <Link
          href="/enroll"
          className="inline-block rounded-lg bg-navy-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-navy-800 transition-colors"
        >
          Enroll
        </Link>
      </div>
    </div>
  );
}
