import { describe, it, expect } from 'vitest';
import { createCourseSchema, updateCourseSchema } from '@/lib/validators/course';
import { createClassSchema, updateClassSchema } from '@/lib/validators/class';
import { GROUP_SIZE_RANGES } from '@/lib/constants';

// ============================================================
// Flow 1: Admin Setup, Course Creation, Class Creation
// ============================================================

// -----------------------------------------------------------
// 1. Course Zod Validation
// -----------------------------------------------------------
describe('Course Validation (createCourseSchema)', () => {
  const validCourse = {
    subject: 'digital_math',
    level: 'essentials',
    name: 'SAT Math Foundations',
    start_date: '2099-06-01',
    end_date: '2099-06-29',
    max_reenroll: 3,
  };

  it('accepts a valid course', () => {
    const result = createCourseSchema.safeParse(validCourse);
    expect(result.success).toBe(true);
  });

  it('rejects invalid subject enum', () => {
    const result = createCourseSchema.safeParse({ ...validCourse, subject: 'history' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid level enum', () => {
    const result = createCourseSchema.safeParse({ ...validCourse, level: 'beginner' });
    expect(result.success).toBe(false);
  });

  it('rejects empty name', () => {
    const result = createCourseSchema.safeParse({ ...validCourse, name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects name over 200 chars', () => {
    const result = createCourseSchema.safeParse({ ...validCourse, name: 'x'.repeat(201) });
    expect(result.success).toBe(false);
  });

  it('rejects invalid date string', () => {
    const result = createCourseSchema.safeParse({ ...validCourse, start_date: 'not-a-date' });
    expect(result.success).toBe(false);
  });

  it('rejects start_date >= end_date', () => {
    const result = createCourseSchema.safeParse({
      ...validCourse,
      start_date: '2099-07-01',
      end_date: '2099-06-01',
    });
    expect(result.success).toBe(false);
  });

  it('rejects start_date == end_date', () => {
    const result = createCourseSchema.safeParse({
      ...validCourse,
      start_date: '2099-06-01',
      end_date: '2099-06-01',
    });
    expect(result.success).toBe(false);
  });

  it('rejects max_reenroll below 1', () => {
    const result = createCourseSchema.safeParse({ ...validCourse, max_reenroll: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects max_reenroll above 10', () => {
    const result = createCourseSchema.safeParse({ ...validCourse, max_reenroll: 11 });
    expect(result.success).toBe(false);
  });

  it('defaults max_reenroll to 3 when omitted', () => {
    const { max_reenroll: _, ...withoutReenroll } = validCourse;
    const result = createCourseSchema.safeParse(withoutReenroll);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.max_reenroll).toBe(3);
    }
  });
});

describe('Course Validation (updateCourseSchema)', () => {
  it('allows partial update (only name)', () => {
    const result = updateCourseSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Updated Name',
    });
    expect(result.success).toBe(true);
  });

  it('requires a valid UUID for id', () => {
    const result = updateCourseSchema.safeParse({
      id: 'not-a-uuid',
      name: 'Test',
    });
    expect(result.success).toBe(false);
  });

  it('skips date order check when only one date provided', () => {
    const result = updateCourseSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      start_date: '2099-12-01',
    });
    expect(result.success).toBe(true);
  });

  it('enforces date order when both dates provided', () => {
    const result = updateCourseSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      start_date: '2099-07-01',
      end_date: '2099-06-01',
    });
    expect(result.success).toBe(false);
  });
});

// -----------------------------------------------------------
// 2. Class Zod Validation
// -----------------------------------------------------------
describe('Class Validation (createClassSchema)', () => {
  // SG/1:1 are subject-agnostic (subject/level set on enrollment, not class)
  const validSmallClass = {
    name: 'Small Group – Mon',
    subject: null,
    level: null,
    group_size_type: 'small',
    capacity: 3,
    meeting_day: 'Monday',
    meeting_time: '16:00',
    google_meet_link: null,
  };

  const validOneOnOneClass = {
    name: '1:1 Private – Tue',
    subject: null,
    level: null,
    group_size_type: 'one_on_one',
    capacity: 1,
    meeting_day: 'Tuesday',
    meeting_time: '14:00',
    google_meet_link: null,
  };

  const validLargeClass = {
    name: 'SAT RW Advanced – Mon/Wed',
    subject: 'digital_rw',
    level: 'advanced',
    group_size_type: 'large',
    capacity: 15,
    meeting_day: 'Monday',
    meeting_time: '16:00',
    meeting_day_2: 'Wednesday',
    meeting_time_2: '16:00',
    class_start_date: '2099-06-01',
    class_end_date: '2099-06-29',
    google_meet_link: null,
  };

  it('accepts a valid small group class', () => {
    const result = createClassSchema.safeParse(validSmallClass);
    expect(result.success).toBe(true);
  });

  it('accepts a valid 1:1 class', () => {
    const result = createClassSchema.safeParse(validOneOnOneClass);
    expect(result.success).toBe(true);
  });

  it('accepts a valid large group class', () => {
    const result = createClassSchema.safeParse(validLargeClass);
    expect(result.success).toBe(true);
  });

  it('rejects invalid group_size_type', () => {
    const result = createClassSchema.safeParse({ ...validSmallClass, group_size_type: 'huge' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid meeting_time format', () => {
    const result = createClassSchema.safeParse({ ...validSmallClass, meeting_time: '4pm' });
    expect(result.success).toBe(false);
  });

  it('rejects empty meeting_day', () => {
    const result = createClassSchema.safeParse({ ...validSmallClass, meeting_day: '' });
    expect(result.success).toBe(false);
  });

  it('rejects SG/1:1 with subject set (subject-agnostic)', () => {
    const result = createClassSchema.safeParse({ ...validSmallClass, subject: 'digital_math' });
    expect(result.success).toBe(false);
  });

  it('rejects SG/1:1 with level set (subject-agnostic)', () => {
    const result = createClassSchema.safeParse({ ...validSmallClass, level: 'essentials' });
    expect(result.success).toBe(false);
  });

  it('rejects 1:1 with subject and level set', () => {
    const result = createClassSchema.safeParse({ ...validOneOnOneClass, subject: 'digital_rw_math', level: 'all_levels' });
    expect(result.success).toBe(false);
  });

  it('rejects LG without meeting_day_2', () => {
    const { meeting_day_2: _, meeting_time_2: __, ...noDay2 } = validLargeClass;
    const result = createClassSchema.safeParse(noDay2);
    expect(result.success).toBe(false);
  });

  it('rejects LG without start/end dates', () => {
    const { class_start_date: _, class_end_date: __, ...noDates } = validLargeClass;
    const result = createClassSchema.safeParse(noDates);
    expect(result.success).toBe(false);
  });

  // Capacity vs group_size_type range validation
  describe('capacity must match group_size_type range', () => {
    // Build valid base objects per group type so refinements pass
    const baseByType: Record<string, Record<string, unknown>> = {
      one_on_one: validOneOnOneClass,
      small: validSmallClass,
      large: validLargeClass,
    };
    const groupTypes = ['one_on_one', 'small', 'large'] as const;

    for (const type of groupTypes) {
      const range = GROUP_SIZE_RANGES[type];
      const base = baseByType[type];

      it(`accepts ${type} at min capacity (${range.min})`, () => {
        const result = createClassSchema.safeParse({
          ...base,
          capacity: range.min,
        });
        expect(result.success).toBe(true);
      });

      it(`accepts ${type} at max capacity (${range.max})`, () => {
        const result = createClassSchema.safeParse({
          ...base,
          capacity: range.max,
        });
        expect(result.success).toBe(true);
      });

      it(`rejects ${type} below min capacity (${range.min - 1})`, () => {
        const result = createClassSchema.safeParse({
          ...base,
          capacity: range.min - 1,
        });
        expect(result.success).toBe(false);
      });

      it(`rejects ${type} above max capacity (${range.max + 1})`, () => {
        const result = createClassSchema.safeParse({
          ...base,
          capacity: range.max + 1,
        });
        expect(result.success).toBe(false);
      });
    }
  });

  it('accepts valid Google Meet link', () => {
    const result = createClassSchema.safeParse({
      ...validSmallClass,
      google_meet_link: 'https://meet.google.com/abc-defg-hij',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid URL for google_meet_link', () => {
    const result = createClassSchema.safeParse({
      ...validSmallClass,
      google_meet_link: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });
});

describe('Class Validation (updateClassSchema)', () => {
  const uuid = '550e8400-e29b-41d4-a716-446655440000';

  it('allows partial update (only capacity)', () => {
    const result = updateClassSchema.safeParse({ id: uuid, capacity: 4 });
    expect(result.success).toBe(true);
  });

  it('skips range check when group_size_type not provided', () => {
    // capacity=15 would be invalid for small but valid for large
    // Since group_size_type is omitted, refine should pass
    const result = updateClassSchema.safeParse({ id: uuid, capacity: 15 });
    expect(result.success).toBe(true);
  });

  it('enforces range check when both group_size_type and capacity provided', () => {
    const result = updateClassSchema.safeParse({
      id: uuid,
      group_size_type: 'small',
      capacity: 10, // small max is 4
    });
    expect(result.success).toBe(false);
  });
});

// -----------------------------------------------------------
// 3. Middleware — Login redirect logic
// -----------------------------------------------------------
describe('Login sanitizeRedirect logic', () => {
  // Replicate the exact logic from login/page.tsx
  const ALLOWED_REDIRECT_PREFIXES = ['/parent', '/student', '/admin', '/enroll', '/onboarding'];

  function sanitizeRedirect(value: string | null): string | undefined {
    if (!value) return undefined;
    if (!value.startsWith('/') || value.startsWith('//')) return undefined;
    if (!ALLOWED_REDIRECT_PREFIXES.some((p) => value.startsWith(p))) return undefined;
    return value;
  }

  it('returns undefined for null', () => {
    expect(sanitizeRedirect(null)).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(sanitizeRedirect('')).toBeUndefined();
  });

  it('blocks open redirect (//evil.com)', () => {
    expect(sanitizeRedirect('//evil.com')).toBeUndefined();
  });

  it('blocks absolute URL (https://evil.com)', () => {
    expect(sanitizeRedirect('https://evil.com')).toBeUndefined();
  });

  it('blocks non-allowlisted path (/secret)', () => {
    expect(sanitizeRedirect('/secret')).toBeUndefined();
  });

  it('allows /parent', () => {
    expect(sanitizeRedirect('/parent')).toBe('/parent');
  });

  it('allows /admin', () => {
    expect(sanitizeRedirect('/admin')).toBe('/admin');
  });

  it('allows /student', () => {
    expect(sanitizeRedirect('/student')).toBe('/student');
  });

  it('allows /enroll/some-class-id', () => {
    expect(sanitizeRedirect('/enroll/some-class-id')).toBe('/enroll/some-class-id');
  });

  it('allows /onboarding', () => {
    expect(sanitizeRedirect('/onboarding')).toBe('/onboarding');
  });
});

// -----------------------------------------------------------
// 4. Middleware — Role-based route protection logic
// -----------------------------------------------------------
describe('Role-based route protection logic', () => {
  const rolePaths: Record<string, string> = {
    parent: '/parent',
    student: '/student',
    admin: '/admin',
  };

  /**
   * Simulates the middleware cross-role check:
   * Returns the redirect path if the role doesn't match the route,
   * or null if access is allowed.
   */
  function checkCrossRoleAccess(pathname: string, role: string): string | null {
    for (const [r, path] of Object.entries(rolePaths)) {
      if (pathname.startsWith(path) && role !== r) {
        return rolePaths[role];
      }
    }
    // Admin blocked from /enroll
    if (pathname.startsWith('/enroll') && role === 'admin') {
      return '/admin';
    }
    return null;
  }

  it('allows admin to access /admin', () => {
    expect(checkCrossRoleAccess('/admin', 'admin')).toBeNull();
  });

  it('allows admin to access /admin/courses', () => {
    expect(checkCrossRoleAccess('/admin/courses', 'admin')).toBeNull();
  });

  it('redirects parent away from /admin', () => {
    expect(checkCrossRoleAccess('/admin', 'parent')).toBe('/parent');
  });

  it('redirects student away from /admin', () => {
    expect(checkCrossRoleAccess('/admin', 'student')).toBe('/student');
  });

  it('redirects admin away from /parent', () => {
    expect(checkCrossRoleAccess('/parent', 'admin')).toBe('/admin');
  });

  it('redirects admin away from /enroll', () => {
    expect(checkCrossRoleAccess('/enroll', 'admin')).toBe('/admin');
  });

  it('allows parent to access /enroll', () => {
    expect(checkCrossRoleAccess('/enroll', 'parent')).toBeNull();
  });

  it('allows student to access /enroll', () => {
    expect(checkCrossRoleAccess('/enroll', 'student')).toBeNull();
  });
});

// -----------------------------------------------------------
// 5. Auth trigger — admin self-signup block (SQL logic proof)
// -----------------------------------------------------------
describe('Auth trigger logic — admin self-signup guard', () => {
  /**
   * Simulates the auth trigger's role resolution logic.
   * Returns the role or throws if admin attempted.
   */
  function resolveRole(rawMetadata: Record<string, string | undefined>): string {
    const role = rawMetadata.role ?? null;

    // OAuth users (no role) skip — handled during onboarding
    if (role === null) {
      return '__skip__';
    }

    // Block admin self-signup
    if (role === 'admin') {
      throw new Error('Admin accounts cannot be self-created');
    }

    return role;
  }

  it('allows parent role', () => {
    expect(resolveRole({ role: 'parent' })).toBe('parent');
  });

  it('allows student role', () => {
    expect(resolveRole({ role: 'student' })).toBe('student');
  });

  it('blocks admin role', () => {
    expect(() => resolveRole({ role: 'admin' })).toThrow('Admin accounts cannot be self-created');
  });

  it('skips when role is undefined (OAuth user)', () => {
    expect(resolveRole({ role: undefined })).toBe('__skip__');
  });

  it('skips when metadata has no role key (OAuth user)', () => {
    expect(resolveRole({})).toBe('__skip__');
  });
});

// -----------------------------------------------------------
// 6. Course delete protection logic
// -----------------------------------------------------------
describe('Course delete protection', () => {
  /**
   * Simulates the deleteCourse pre-check:
   * Blocks deletion if active/pending enrollments exist.
   */
  function canDeleteCourse(activeOrPendingCount: number): { allowed: boolean; error?: string } {
    if (activeOrPendingCount > 0) {
      return { allowed: false, error: 'Cannot delete course with active enrollments.' };
    }
    return { allowed: true };
  }

  it('allows deletion when no enrollments', () => {
    expect(canDeleteCourse(0)).toEqual({ allowed: true });
  });

  it('blocks deletion with 1 active enrollment', () => {
    const result = canDeleteCourse(1);
    expect(result.allowed).toBe(false);
    expect(result.error).toContain('active enrollments');
  });

  it('blocks deletion with many enrollments', () => {
    const result = canDeleteCourse(50);
    expect(result.allowed).toBe(false);
  });
});

// -----------------------------------------------------------
// 7. Class capacity floor check (update action logic)
// -----------------------------------------------------------
describe('Class capacity update — floor check', () => {
  /**
   * Simulates the updateClass capacity pre-check:
   * Blocks if new capacity < active enrollment count.
   */
  function canReduceCapacity(newCapacity: number, activeCount: number): { allowed: boolean; error?: string } {
    if (newCapacity < activeCount) {
      return { allowed: false, error: `Cannot reduce capacity below active enrollment count (${activeCount}).` };
    }
    return { allowed: true };
  }

  it('allows capacity equal to active count', () => {
    expect(canReduceCapacity(3, 3)).toEqual({ allowed: true });
  });

  it('allows capacity above active count', () => {
    expect(canReduceCapacity(5, 3)).toEqual({ allowed: true });
  });

  it('blocks capacity below active count', () => {
    const result = canReduceCapacity(2, 3);
    expect(result.allowed).toBe(false);
    expect(result.error).toContain('(3)');
  });
});
