'use client';

import { useState, useEffect, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function ResetPasswordPage() {
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [ready, setReady] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true);
      }
    });

    // Also check if we already have a session (user clicked the link)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setReady(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      setError('');
      const password = formData.get('password') as string;
      const confirm = formData.get('confirm') as string;

      if (!password || password.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }

      if (password !== confirm) {
        setError('Passwords do not match.');
        return;
      }

      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push('/login'), 2000);
    });
  }

  if (success) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-6 text-center">
          <h1 className="text-2xl font-bold">Password Updated</h1>
          <p className="text-sm text-gray-600">Redirecting to login...</p>
        </div>
      </main>
    );
  }

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-6 text-center">
          <h1 className="text-2xl font-bold">Reset Password</h1>
          <p className="text-sm text-gray-600">Verifying your reset link...</p>
          <p className="text-xs text-gray-400">
            If this takes too long, your link may have expired.{' '}
            <Link href="/forgot-password" className="underline">
              Request a new one
            </Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-bold text-center">Reset Password</h1>
        {error && <p className="text-red-600 text-sm text-center">{error}</p>}

        <form action={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">New Password</label>
            <input
              type="password"
              name="password"
              required
              minLength={6}
              className="w-full rounded border px-3 py-2"
              placeholder="At least 6 characters"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Confirm Password</label>
            <input
              type="password"
              name="confirm"
              required
              minLength={6}
              className="w-full rounded border px-3 py-2"
              placeholder="Repeat your password"
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded bg-black py-3 text-white font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {isPending ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </main>
  );
}
