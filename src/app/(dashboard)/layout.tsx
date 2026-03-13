import { redirect } from 'next/navigation';
import { ServerNav } from '@/components/server-nav';
import { getNavProps } from '@/lib/auth/get-nav-props';
import { createClient } from '@/lib/supabase/server';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const navProps = await getNavProps();

  return (
    <div className="flex min-h-screen flex-col bg-navy-50">
      <ServerNav {...navProps} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
