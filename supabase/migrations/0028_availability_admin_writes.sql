-- 0028_availability_admin_writes — let the admin actually write availability (F11).
--
-- 0006 created the `_admin_write` policies but granted only `select` to `authenticated`. Table
-- privileges are checked before RLS, so the admin editor's insert was refused by Postgres and the
-- policy never ran: /admin/availability could list rules and never add one. RLS still decides who
-- may write — these grants only let the check happen.

grant insert, update on availability_rules, availability_exceptions to authenticated;
