'use client';

import { useState } from 'react';
import Link from 'next/link';

interface MobileNavProps {
  userRole: string | null;
  userName?: string | null;
  showPayments?: boolean;
}

const roleBadgeColors: Record<string, string> = {
  admin: 'bg-gold-500 text-white',
  parent: 'bg-navy-100 text-navy-800',
  student: 'bg-navy-50 text-navy-700',
};

export function MobileNav({ userRole, userName, showPayments }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="sm:hidden">
      <button
        onClick={() => setOpen(!open)}
        className="rounded-md p-2 text-navy-200 hover:bg-navy-800 hover:text-white"
        aria-label="Toggle menu"
      >
        {open ? (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        )}
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 border-t border-navy-800 bg-navy-900 px-6 pb-4 pt-2">
          {userRole && userName && (
            <div className="mb-3 flex items-center gap-2 border-b border-navy-800 pb-3">
              <span className="text-sm text-navy-200">{userName}</span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  roleBadgeColors[userRole] || 'bg-navy-100 text-navy-800'
                }`}
              >
                {userRole}
              </span>
            </div>
          )}

          <div className="flex flex-col gap-1">
            {userRole && (
              <Link
                href={`/${userRole}`}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-navy-200 hover:bg-navy-800 hover:text-white"
              >
                Dashboard
              </Link>
            )}
            <Link
              href="/offerings"
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2 text-sm font-medium text-navy-200 hover:bg-navy-800 hover:text-white"
            >
              Class Schedule
            </Link>
            {(userRole === 'parent' || userRole === 'student') && (
              <Link
                href="/enroll"
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-navy-200 hover:bg-navy-800 hover:text-white"
              >
                Enroll
              </Link>
            )}
            {showPayments && userRole && (
              <Link
                href={`/${userRole}/payments`}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-navy-200 hover:bg-navy-800 hover:text-white"
              >
                Payments
              </Link>
            )}
            {!userRole && (
              <Link
                href="/book"
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-navy-200 hover:bg-navy-800 hover:text-white"
              >
                Book a Meeting
              </Link>
            )}
          </div>

          {userRole ? (
            <form action="/api/auth/signout" method="post" className="mt-3 border-t border-navy-800 pt-3">
              <button
                type="submit"
                className="w-full rounded-md px-3 py-2 text-left text-sm text-navy-300 hover:bg-navy-800 hover:text-white"
              >
                Sign Out
              </button>
            </form>
          ) : (
            <div className="mt-3 flex flex-col gap-2 border-t border-navy-800 pt-3">
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-navy-200 hover:bg-navy-800 hover:text-white"
              >
                Log In
              </Link>
              <Link
                href="/signup"
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-navy-200 hover:bg-navy-800 hover:text-white"
              >
                Sign Up
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
