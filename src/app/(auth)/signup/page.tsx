'use client';

import { useState, useTransition } from 'react';
import { signInWithGoogle } from '@/lib/auth/google-oauth';
import { signupWithPasswordAction } from './actions';
import Link from 'next/link';

export default function SignupPage() {
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  async function handleGoogleSignup() {
    try {
      await signInWithGoogle('/onboarding');
    } catch {
      setError('Failed to sign in with Google');
    }
  }

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
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-bold text-center">Sign Up</h1>
        {error && <p className="text-red-600 text-sm text-center">{error}</p>}

        <form action={handlePasswordSignup} className="space-y-4">
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
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              type="password"
              name="password"
              required
              minLength={6}
              className="w-full rounded border px-3 py-2"
              placeholder="At least 6 characters"
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded bg-black py-3 text-white font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {isPending ? 'Creating account...' : 'Sign Up'}
          </button>
        </form>

        <div className="flex items-center gap-3 text-gray-400 text-sm">
          <div className="flex-1 border-t" />
          or
          <div className="flex-1 border-t" />
        </div>

        <button
          onClick={handleGoogleSignup}
          className="w-full rounded border py-3 font-medium hover:bg-gray-50"
        >
          Sign up with Google
        </button>

        <p className="text-center text-sm text-gray-600">
          Already have an account?{' '}
          <Link href="/login" className="underline">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
