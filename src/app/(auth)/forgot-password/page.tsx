'use client';

import { useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      setError('');
      setSuccess(false);
      if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true') {
        setError('Password reset is disabled in this portfolio demo.');
        return;
      }
      const email = (formData.get('email') as string)?.trim().toLowerCase();
      if (!email) {
        setError('Please enter your email address.');
        return;
      }

      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (resetError) {
        setError(resetError.message);
        return;
      }

      setSuccess(true);
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-bold text-center">Forgot Password</h1>

        {success ? (
          <div className="space-y-4">
            <p className="text-center text-sm text-gray-600">
              If an account exists with that email, you&apos;ll receive a password reset link shortly.
            </p>
            <Link
              href="/login"
              className="block w-full rounded border py-3 text-center font-medium hover:bg-gray-50"
            >
              Back to Log In
            </Link>
          </div>
        ) : (
          <>
            {error && <p className="text-red-600 text-sm text-center">{error}</p>}
            <p className="text-center text-sm text-gray-600">
              Enter your email and we&apos;ll send you a link to reset your password.
            </p>
            <form action={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  name="email"
                  required
                  className="w-full rounded border px-3 py-2"
                  placeholder="you@example.com"
                />
              </div>
              <button
                type="submit"
                disabled={isPending}
                className="w-full rounded bg-black py-3 text-white font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                {isPending ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>
            <p className="text-center text-sm text-gray-600">
              <Link href="/login" className="underline">
                Back to Log In
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
