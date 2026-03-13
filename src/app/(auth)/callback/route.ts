import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

const ALLOWED_REDIRECT_PREFIXES = [
  '/onboarding',
  '/parent',
  '/student',
  '/admin',
  '/enroll',
];

function sanitizeRedirect(redirectTo: string | null): string | null {
  if (!redirectTo) return null;
  if (!redirectTo.startsWith('/') || redirectTo.startsWith('//')) return null;
  if (!ALLOWED_REDIRECT_PREFIXES.some((p) => redirectTo.startsWith(p))) return null;
  return redirectTo;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const redirectTo = sanitizeRedirect(searchParams.get('redirectTo'));

  if (code) {
    const cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[] = [];

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookies) {
            cookies.forEach(({ name, value }) => request.cookies.set(name, value));
            cookiesToSet.push(...cookies);
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      let destination = `${origin}/`;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const userEmail = user.email;

        // Check if this user already has a public.users profile
        const { data: profile } = await supabase
          .from('users')
          .select('role, phone')
          .eq('id', user.id)
          .single();

        if (!profile && userEmail) {
          // New OAuth user — check if their Google email matches a pre-registered student
          const adminSupabase = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
          );

          // email column may not exist if migration 00046 not applied — query will fail gracefully
          const { data: pendingStudent } = await adminSupabase
            .from('students')
            .select('id, parent_id')
            .eq('email', userEmail.toLowerCase())
            .is('user_id', null)
            .single();

          if (pendingStudent) {
            // Auto-link: create users row and link student
            const fullName = user.user_metadata?.full_name
              || user.user_metadata?.name
              || userEmail.split('@')[0];

            await adminSupabase.from('users').insert({
              id: user.id,
              role: 'student',
              full_name: fullName,
              phone: null,
            });

            await adminSupabase
              .from('students')
              .update({ user_id: user.id })
              .eq('id', pendingStudent.id);

            destination = `${origin}/student`;
          } else {
            // No match — send to onboarding
            destination = redirectTo
              ? `${origin}${redirectTo}`
              : `${origin}/onboarding`;
          }
        } else if (!profile) {
          // No email to match and no profile — send to onboarding
          destination = redirectTo
            ? `${origin}${redirectTo}`
            : `${origin}/onboarding`;
        } else if (redirectTo) {
          destination = `${origin}${redirectTo}`;
        } else {
          destination = `${origin}/${profile.role}`;
        }
      }

      const response = NextResponse.redirect(destination);
      cookiesToSet.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, options);
      });
      return response;
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
