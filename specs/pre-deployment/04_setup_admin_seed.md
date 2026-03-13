# Admin User Seed — Step-by-Step

Run these in the **Supabase SQL Editor**, one at a time, in order.

---

## Step 1: Clean Slate

```sql
TRUNCATE public.students CASCADE;
TRUNCATE public.users CASCADE;
DELETE FROM auth.identities;
DELETE FROM auth.users;
```

## Step 2: Remove Admin Guard from Auth Trigger

```sql
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role user_role;
  v_full_name TEXT;
  v_phone TEXT;
BEGIN
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'student')::user_role;
  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    ''
  );
  v_phone := NEW.raw_user_meta_data->>'phone';

  INSERT INTO public.users (id, role, full_name, phone)
  VALUES (NEW.id, v_role, v_full_name, v_phone)
  ON CONFLICT (id) DO NOTHING;

  IF v_role = 'student' THEN
    INSERT INTO public.students (user_id, parent_id, active_status)
    VALUES (NEW.id, NULL, 'active')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

## Step 3: Create Admin User via Supabase Dashboard

Go to **Supabase Dashboard → Authentication → Users → Add User**:
- Email: `admin@provablelearning.com`
- Password: your choice
- **Auto Confirm User**: check this box

## Step 4: Set Role to Admin

```sql
ALTER TABLE public.users DISABLE TRIGGER trg_prevent_role_change;

UPDATE public.users
SET role = 'admin', full_name = 'Admin'
WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@provablelearning.com');

ALTER TABLE public.users ENABLE TRIGGER trg_prevent_role_change;
```

## Step 5: Restore Admin Guard

```sql
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role user_role;
  v_full_name TEXT;
  v_phone TEXT;
BEGIN
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'student')::user_role;
  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    ''
  );
  v_phone := NEW.raw_user_meta_data->>'phone';

  IF v_role = 'admin' THEN
    RAISE EXCEPTION 'Admin accounts cannot be self-created';
  END IF;

  INSERT INTO public.users (id, role, full_name, phone)
  VALUES (NEW.id, v_role, v_full_name, v_phone)
  ON CONFLICT (id) DO NOTHING;

  IF v_role = 'student' THEN
    INSERT INTO public.students (user_id, parent_id, active_status)
    VALUES (NEW.id, NULL, 'active')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

## Step 6: Verify

```sql
SELECT id, role, full_name FROM public.users;
```

Should show one row with `role = admin`.

## Step 7: Test Login

Go to `localhost:3000/login` and sign in with the admin email/password. You should be redirected to `/admin`.

---

## After Admin is Set Up

1. **Create a course** at `/admin/courses` (set dates in the future)
2. **Create a class** under that course at `/admin/classes`
3. **Sign up as a parent** (new email + phone + password)
4. **Browse modules** at `/enroll` — should see the module
5. **Try enrolling** a student
