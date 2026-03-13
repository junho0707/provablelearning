'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function AuthNav() {
  const [dashboardPath, setDashboardPath] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    async function check() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single();
        if (profile?.role) {
          setDashboardPath(`/${profile.role}`);
        }
      }
      setChecked(true);
    }

    check();
  }, []);

  if (!checked) return null;

  if (dashboardPath) {
    return (
      <Link
        href={dashboardPath}
        className="text-sm font-medium text-gray-600 hover:text-black px-3 py-2"
      >
        Dashboard
      </Link>
    );
  }

  return (
    <Link
      href="/login"
      className="text-sm font-medium text-gray-600 hover:text-black px-3 py-2"
    >
      Log In
    </Link>
  );
}
