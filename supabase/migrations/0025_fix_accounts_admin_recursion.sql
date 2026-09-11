-- 0025_fix_accounts_admin_recursion — break the RLS recursion on `accounts`.
--
-- 0010 added `accounts_admin_read`, whose USING clause selects from `accounts`. Its comment argued
-- the self-reference was safe because the subquery would be evaluated under `accounts_select_own`.
-- Postgres does not work that way: a policy on a relation that reads the same relation is detected
-- as recursion and the whole query aborts with 42P17. The effect was not limited to admin reads —
-- permissive policies are OR'd, so **every** authenticated read of `accounts` failed, which meant
-- `currentBuyerId()` returned null for every buyer and each account-scoped page bounced to /login.
--
-- The fix is a `security definer` helper: it reads `accounts` with RLS bypassed, so the policy no
-- longer refers to the relation it guards. The other `*_admin_read` policies from 0010 are left
-- alone — they read `accounts` from a *different* relation, which never recursed.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select a.is_admin from accounts a where a.id = auth.uid()), false);
$$;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, service_role;

drop policy if exists accounts_admin_read on accounts;
create policy accounts_admin_read on accounts for select using (public.is_admin());
