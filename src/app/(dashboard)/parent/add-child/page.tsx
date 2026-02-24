'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { addChildAction } from './actions';

export default function AddChildPage() {
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    startTransition(async () => {
      setError('');
      const result = await addChildAction(formData);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-bold mb-6">Add Child</h1>
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      <form action={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Child&apos;s Full Name</label>
          <input
            type="text"
            name="full_name"
            required
            className="w-full rounded border px-3 py-2"
            placeholder="Enter child's name"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Grade Level</label>
          <select name="grade_level" required className="w-full rounded border px-3 py-2">
            <option value="">Select grade</option>
            {[6, 7, 8, 9, 10, 11, 12].map((g) => (
              <option key={g} value={g}>
                Grade {g}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Child&apos;s Email</label>
          <input
            type="email"
            name="email"
            required
            className="w-full rounded border px-3 py-2"
            placeholder="child@example.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Initial Password</label>
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
            name="confirm_password"
            required
            minLength={6}
            className="w-full rounded border px-3 py-2"
            placeholder="Repeat password"
          />
        </div>

        <p className="text-xs text-gray-400">
          Your child will use this email and password to log in on school devices.
          They can also sign in with Google using the same email.
        </p>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="flex-1 rounded bg-black py-2 text-white font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {isPending ? 'Adding...' : 'Add Child'}
          </button>
          <Link
            href="/parent"
            className="flex-1 rounded border py-2 text-center font-medium hover:bg-gray-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
