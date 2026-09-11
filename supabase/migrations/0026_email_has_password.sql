-- 0026_email_has_password — lets the sign-in form ask "password or magic link?" before it asks for
-- a secret.
--
-- The buyer's sign-in is email-first: one field, then either a password box (they have set one) or
-- a magic link (they have not). Deciding that needs one bit out of `auth.users`, which is not
-- readable by PostgREST and must not become readable — hence a narrow SECURITY DEFINER function
-- that returns a boolean and nothing else.
--
-- **Students are excluded.** Their identities live on the reserved `.invalid` TLD (migration 0017)
-- and they always have a password, so including them would turn this into a way to confirm a
-- student's existence from an unauthenticated form — the opposite of INV-AUTH-2. A student signs in
-- with a username on `/student/login`, never here.
--
-- This function tells an unauthenticated caller whether an address has a password, which is an
-- account-enumeration surface by construction: that is the cost of the email-first UX, and it is
-- bounded to one bit that reveals nothing an attacker can authenticate with. GoTrue's own rate
-- limiting is what keeps it from being scraped cheaply.

create or replace function email_has_password(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users u
    where lower(u.email) = lower(trim(p_email))
      and u.email not like '%.invalid'
      and u.encrypted_password is not null
      and u.encrypted_password <> ''
      and u.deleted_at is null
  );
$$;

revoke all on function email_has_password(text) from public;
grant execute on function email_has_password(text) to anon, authenticated;
