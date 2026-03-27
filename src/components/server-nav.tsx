import Link from 'next/link';
import { MobileNav } from './mobile-nav';

interface ServerNavProps {
  userRole: string | null;
  userName?: string | null;
  showPayments?: boolean;
}

const roleBadgeColors: Record<string, string> = {
  admin: 'bg-gold-500 text-white',
  parent: 'bg-navy-100 text-navy-800',
  student: 'bg-navy-50 text-navy-700',
};

export function ServerNav({ userRole, userName, showPayments }: ServerNavProps) {
  return (
    <nav className="sticky top-0 z-50 bg-navy-900/95 text-white backdrop-blur-sm">
      <div className="relative mx-auto max-w-7xl px-4 py-3 sm:px-6">
        {/* Mobile layout: hamburger left, logo center, auth right */}
        <div className="grid grid-cols-3 items-center sm:hidden">
          <div className="flex justify-start">
            <MobileNav userRole={userRole} userName={userName} showPayments={showPayments} />
          </div>
          <div className="flex justify-center">
            <Link href="/" className="text-lg font-bold tracking-tight">
              Provable<span className="text-gold-400">Learning</span>
            </Link>
          </div>
          <div className="flex items-center justify-end gap-2">
            {userRole && userName ? (
              <form action="/api/auth/signout" method="post">
                <button
                  type="submit"
                  className="rounded-md px-2 py-1.5 text-xs text-navy-300 hover:bg-navy-800 hover:text-white"
                >
                  Sign Out
                </button>
              </form>
            ) : !userRole ? (
              <Link
                href="/login"
                className="rounded-md px-2 py-1.5 text-xs font-medium text-navy-200 hover:bg-navy-800 hover:text-white"
              >
                Log In
              </Link>
            ) : null}
          </div>
        </div>

        {/* Desktop layout: logo+links left, user info right */}
        <div className="hidden items-center justify-between sm:flex">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-xl font-bold tracking-tight">
              Provable<span className="text-gold-400">Learning</span>
            </Link>
            <div className="flex items-center gap-1">
              {userRole && (
                <Link
                  href={`/${userRole}`}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-navy-200 hover:bg-navy-800 hover:text-white"
                >
                  Dashboard
                </Link>
              )}
              <Link
                href="/offerings"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-navy-200 hover:bg-navy-800 hover:text-white"
              >
                Class Schedule
              </Link>
              {(userRole === 'parent' || userRole === 'student') && (
                <Link
                  href="/enroll"
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-navy-200 hover:bg-navy-800 hover:text-white"
                >
                  Enroll
                </Link>
              )}
              {showPayments && userRole && (
                <Link
                  href={`/${userRole}/payments`}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-navy-200 hover:bg-navy-800 hover:text-white"
                >
                  Payments
                </Link>
              )}
              {!userRole && (
                <Link
                  href="/book"
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-navy-200 hover:bg-navy-800 hover:text-white"
                >
                  Book a Meeting
                </Link>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {userRole && userName ? (
              <>
                <span className="flex items-center gap-2 text-sm">
                  <span className="text-navy-200">{userName}</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      roleBadgeColors[userRole] || 'bg-navy-100 text-navy-800'
                    }`}
                  >
                    {userRole}
                  </span>
                </span>
                <form action="/api/auth/signout" method="post">
                  <button
                    type="submit"
                    className="rounded-md px-3 py-1.5 text-sm text-navy-300 hover:bg-navy-800 hover:text-white"
                  >
                    Sign Out
                  </button>
                </form>
              </>
            ) : !userRole ? (
              <>
                <Link
                  href="/login"
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-navy-200 hover:bg-navy-800 hover:text-white"
                >
                  Log In
                </Link>
                <Link
                  href="/signup"
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-navy-200 hover:bg-navy-800 hover:text-white"
                >
                  Sign Up
                </Link>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </nav>
  );
}
