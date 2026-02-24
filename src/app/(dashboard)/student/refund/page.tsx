import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function StudentRefundPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Refunds</h1>

      <div className="border rounded-lg p-6 max-w-lg">
        <p className="text-gray-700 mb-4">
          Refund requests are handled on a case-by-case basis. To discuss a refund, please
          schedule a consultation with our team.
        </p>

        <Link
          href="/book"
          className="inline-block rounded bg-black px-4 py-2 text-white text-sm font-medium hover:bg-gray-800"
        >
          Schedule a Consultation
        </Link>
      </div>
    </div>
  );
}
