import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('full_name, role')
    .eq('id', user.id)
    .single();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b px-6 py-4 flex items-center justify-between">
        <Link href={`/${profile?.role || ''}`} className="font-bold text-lg">
          ProvableLearning
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">
            {profile?.full_name}
            <span className="ml-2 text-xs bg-gray-100 px-2 py-0.5 rounded">
              {profile?.role}
            </span>
          </span>
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="text-sm text-gray-500 hover:text-gray-800"
            >
              Sign Out
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
