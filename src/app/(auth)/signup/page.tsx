'use client';

import { useState, useTransition } from 'react';
import { signupWithPasswordAction } from './actions';
import Link from 'next/link';

export default function SignupPage() {
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  const googleAuthUrl = '/api/auth/google?redirectTo=%2Fonboarding';

  function handlePasswordSignup(formData: FormData) {
    startTransition(async () => {
      setError('');
      const result = await signupWithPasswordAction(formData);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <main className="flex min-h-[calc(100vh-56px)] items-center justify-center bg-navy-50 p-8">
      <div className="w-full max-w-sm space-y-6 rounded-xl bg-white p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-navy-900">Create your account</h1>
          <p className="mt-1 text-sm text-slate-500">Get started with Digital SAT prep</p>
        </div>

        {error && (
          <div className="rounded-lg bg-error-light px-4 py-3 text-sm text-error">
            {error}
          </div>
        )}

        <form action={handlePasswordSignup} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              name="email"
              required
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm placeholder:text-slate-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-500/20"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
            <input
              type="password"
              name="password"
              required
              minLength={6}
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm placeholder:text-slate-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-500/20"
              placeholder="At least 6 characters"
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-lg bg-navy-900 py-3 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-50"
          >
            {isPending ? 'Creating account...' : 'Sign Up'}
          </button>
        </form>

        <div className="flex items-center gap-3 text-sm text-slate-400">
          <div className="flex-1 border-t border-slate-200" />
          or
          <div className="flex-1 border-t border-slate-200" />
        </div>

        <a
          href={googleAuthUrl}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Sign up with Google
        </a>

        <p className="text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-navy-600 hover:text-navy-800">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
