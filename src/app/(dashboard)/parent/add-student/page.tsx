'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { addStudentAction } from './actions';

export default function AddStudentPage() {
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    startTransition(async () => {
      setError('');
      const result = await addStudentAction(formData);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">Add Student</h1>
        <p className="text-slate-500">Register a new student to your account.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        {error && (
          <div className="bg-error-light border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">
            {error}
          </div>
        )}

        <form action={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Student&apos;s Full Name</label>
              <input
                type="text"
                name="full_name"
                required
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-navy-400 focus:ring-1 focus:ring-navy-400 outline-none"
                placeholder="Enter student's name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Grade Level</label>
              <select name="grade_level" required className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-navy-400 focus:ring-1 focus:ring-navy-400 outline-none">
                <option value="">Select grade</option>
                {[6, 7, 8, 9, 10, 11, 12].map((g) => (
                  <option key={g} value={g}>
                    Grade {g}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Student&apos;s Email</label>
              <input
                type="email"
                name="email"
                required
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-navy-400 focus:ring-1 focus:ring-navy-400 outline-none"
                placeholder="student@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Initial Password</label>
              <input
                type="password"
                name="password"
                required
                minLength={6}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-navy-400 focus:ring-1 focus:ring-navy-400 outline-none"
                placeholder="At least 6 characters"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Confirm Password</label>
              <input
                type="password"
                name="confirm_password"
                required
                minLength={6}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-navy-400 focus:ring-1 focus:ring-navy-400 outline-none"
                placeholder="Repeat password"
              />
            </div>

            <p className="text-xs text-slate-400">
              Your student will use this email and password to log in on school devices.
              They can also sign in with Google using the same email.
            </p>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={isPending}
                className="flex-1 rounded-lg bg-navy-900 py-2.5 text-white font-medium hover:bg-navy-800 disabled:opacity-50 transition-colors"
              >
                {isPending ? 'Adding...' : 'Add Student'}
              </button>
              <Link
                href="/parent"
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-center font-medium text-slate-700 hover:bg-navy-50 transition-colors"
              >
                Cancel
              </Link>
            </div>
        </form>
      </div>
    </div>
  );
}
