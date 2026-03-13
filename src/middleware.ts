import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const publicPaths = ['/', '/login', '/signup', '/callback', '/forgot-password', '/reset-password', '/api/webhooks/stripe', '/api/cron', '/api/bookings', '/book', '/offerings'];

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Let the callback route handle auth code exchange without any cookie interference
  if (pathname === '/callback' || pathname.startsWith('/callback/')) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Allow public paths
  if (publicPaths.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    // Redirect authenticated users away from auth pages and landing page
    if (user && (pathname.startsWith('/login') || pathname.startsWith('/signup'))) {
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profile?.role) {
        return NextResponse.redirect(new URL(`/${profile.role}`, request.url));
      }
    }
    return supabaseResponse;
  }

  // Protect all other routes
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(url);
  }

  // Role-based route protection
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile) {
    // User exists in auth but not in public.users yet — let them through to onboarding
    if (pathname.startsWith('/onboarding')) {
      return supabaseResponse;
    }
    return NextResponse.redirect(new URL('/onboarding', request.url));
  }

  // Independent student completeness check: must have a students row
  if (profile.role === 'student' && !pathname.startsWith('/onboarding')) {
    const { data: studentRow } = await supabase
      .from('students')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!studentRow) {
      return NextResponse.redirect(new URL('/onboarding', request.url));
    }
  }

  const role = profile.role;
  const rolePaths: Record<string, string> = {
    parent: '/parent',
    student: '/student',
    admin: '/admin',
  };

  // Block cross-role access
  for (const [r, path] of Object.entries(rolePaths)) {
    if (pathname.startsWith(path) && role !== r) {
      return NextResponse.redirect(new URL(rolePaths[role], request.url));
    }
  }

  // Enrollment pages accessible by parents and independent students
  if (pathname.startsWith('/enroll') && role !== 'parent' && role !== 'student') {
    return NextResponse.redirect(new URL(rolePaths[role] || '/', request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
