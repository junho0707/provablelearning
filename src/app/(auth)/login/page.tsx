'use client';

import { useState, Suspense, useTransition } from 'react';
import { signInWithGoogle } from '@/lib/auth/google-oauth';
import { loginWithPasswordAction } from './actions';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

const ALLOWED_REDIRECT_PREFIXES = ['/parent', '/student', '/admin', '/enroll', '/onboarding'];

function sanitizeRedirect(value: string | null): string | undefined {
  if (!value) return undefined;
  if (!value.startsWith('/') || value.startsWith('//')) return undefined;
  if (!ALLOWED_REDIRECT_PREFIXES.some((p) => value.startsWith(p))) return undefined;
  return value;
}

function LoginForm() {
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();
  const searchParams = useSearchParams();
  const redirectTo = sanitizeRedirect(searchParams.get('redirectTo'));

  async function handleGoogleLogin() {
    try {
      await signInWithGoogle(redirectTo);
    } catch {
      setError('Failed to sign in with Google');
    }
  }

  function handlePasswordLogin(formData: FormData) {
    startTransition(async () => {
      setError('');
      if (redirectTo) formData.set('redirectTo', redirectTo);
      const result = await loginWithPasswordAction(formData);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <>
      {error && (
        <p className="text-red-600 text-sm text-center">{error}</p>
      )}

      <form action={handlePasswordLogin} className="space-y-4">
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
            className="w-full rounded border px-3 py-2"
            placeholder="Your password"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded bg-black py-3 text-white font-medium hover:bg-gray-800 disabled:opacity-50"
        >
          {isPending ? 'Logging in...' : 'Log In'}
        </button>
        <p className="text-right text-sm">
          <Link href="/forgot-password" className="text-gray-600 underline">
            Forgot password?
          </Link>
        </p>
      </form>

      <div className="flex items-center gap-3 text-gray-400 text-sm">
        <div className="flex-1 border-t" />
        or
        <div className="flex-1 border-t" />
      </div>

      <button
        onClick={handleGoogleLogin}
        className="w-full rounded border py-3 font-medium hover:bg-gray-50"
      >
        Sign in with Google
      </button>

      <p className="text-center text-sm text-gray-600">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="underline">
          Sign up
        </Link>
      </p>
    </>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-bold text-center">Log In</h1>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
