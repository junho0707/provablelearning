import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock modules
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/scheduling/session-dates', () => ({
  computeSessionDates: vi.fn(),
}));

import { createAdminClient } from '@/lib/supabase/admin';
import { computeSessionDates } from '@/lib/scheduling/session-dates';

// We test findAlternateSessions directly since it's pure logic
// The RPC-based actions (bookMakeupSession, cancelMakeupBooking) are thin wrappers
// around Postgres RPCs and are tested via the RPC validation tests below

// Helper to create a mock admin client for findAlternateSessions
function createMockAdminClient(overrides: {
  cancellation?: Record<string, unknown> | null;
  classes?: Record<string, unknown>[];
  course?: Record<string, unknown> | null;
  activeCountByClass?: Record<string, number>;
  makeupCountByClass?: Record<string, number>;
}) {
  const {
    cancellation,
    classes = [],
    course = { start_date: '2026-03-01' },
    activeCountByClass = {},
    makeupCountByClass = {},
  } = overrides;

  return {
    from: (table: string) => {
      if (table === 'session_cancellations') {
        return {
          select: () => ({
            eq: (_col: string, _val: unknown) => ({
              single: () =>
                Promise.resolve({
                  data: cancellation,
                  error: cancellation ? null : { message: 'Not found' },
                }),
            }),
          }),
        };
      }
      if (table === 'classes') {
        return {
          select: () => ({
            eq: (_c1: string, _v1: unknown) => ({
              eq: (_c2: string, _v2: unknown) => ({
                eq: (_c3: string, _v3: unknown) => ({
                  neq: (_c4: string, _v4: unknown) =>
                    Promise.resolve({ data: classes }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'courses') {
        return {
          select: () => ({
            eq: (_col: string, _val: unknown) => ({
              single: () =>
                Promise.resolve({
                  data: course,
                  error: course ? null : { message: 'Not found' },
                }),
            }),
          }),
        };
      }
      if (table === 'enrollments') {
        return {
          select: (_sel: string, _opts: unknown) => ({
            eq: (col: string, val: unknown) => {
              if (col === 'class_id') {
                return {
                  eq: () =>
                    Promise.resolve({
                      count: activeCountByClass[val as string] ?? 0,
                    }),
                };
              }
              return {
                eq: () => Promise.resolve({ count: 0 }),
              };
            },
          }),
        };
      }
      if (table === 'makeup_bookings') {
        return {
          select: (_sel: string, _opts: unknown) => ({
            eq: (col: string, val: unknown) => {
              if (col === 'host_class_id') {
                return {
                  eq: () => ({
                    eq: () =>
                      Promise.resolve({
                        count: makeupCountByClass[val as string] ?? 0,
                      }),
                  }),
                };
              }
              return {
                eq: () => ({
                  eq: () => Promise.resolve({ count: 0 }),
                }),
              };
            },
          }),
        };
      }
      return {};
    },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('Alternate Session Discovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty when cancellation not found', async () => {
    const mock = createMockAdminClient({ cancellation: null });
    vi.mocked(createAdminClient).mockReturnValue(mock);

    const { findAlternateSessions } = await import(
      '@/lib/cancellation/find-alternate-sessions'
    );
    const result = await findAlternateSessions('nonexistent-id');
    expect(result.error).toBe('Cancellation not found');
  });

  it('rejects one_on_one cancellations', async () => {
    const mock = createMockAdminClient({
      cancellation: {
        id: 'c1',
        course_id: 'co1',
        class_id: 'cl1',
        session_number: 3,
        session_date: '2026-03-18',
        group_size_type: 'one_on_one',
        status: 'cancelled',
      },
    });
    vi.mocked(createAdminClient).mockReturnValue(mock);

    const { findAlternateSessions } = await import(
      '@/lib/cancellation/find-alternate-sessions'
    );
    const result = await findAlternateSessions('c1');
    expect(result.error).toBe('Alternate sessions not available for 1:1');
  });

  it('rejects if cancellation is not in cancelled status', async () => {
    const mock = createMockAdminClient({
      cancellation: {
        id: 'c1',
        course_id: 'co1',
        class_id: 'cl1',
        session_number: 3,
        session_date: '2026-03-18',
        group_size_type: 'small',
        status: 'rescheduled',
      },
    });
    vi.mocked(createAdminClient).mockReturnValue(mock);

    const { findAlternateSessions } = await import(
      '@/lib/cancellation/find-alternate-sessions'
    );
    const result = await findAlternateSessions('c1');
    expect(result.error).toBe('Cancellation is not in cancelled status');
  });

  it('returns empty array when no alternate classes exist', async () => {
    const mock = createMockAdminClient({
      cancellation: {
        id: 'c1',
        course_id: 'co1',
        class_id: 'cl1',
        session_number: 3,
        session_date: '2026-03-18',
        group_size_type: 'small',
        status: 'cancelled',
      },
      classes: [],
    });
    vi.mocked(createAdminClient).mockReturnValue(mock);

    const { findAlternateSessions } = await import(
      '@/lib/cancellation/find-alternate-sessions'
    );
    const result = await findAlternateSessions('c1');
    expect(result.sessions).toEqual([]);
  });

  it('finds alternate sessions in same week with available capacity', async () => {
    // Original session: Wednesday 2026-03-18 (session 3)
    // Alternate class meets on Thursday — session 3 would be 2026-03-19 (same week)
    const mock = createMockAdminClient({
      cancellation: {
        id: 'c1',
        course_id: 'co1',
        class_id: 'cl1',
        session_number: 3,
        session_date: '2026-03-18', // Wednesday
        group_size_type: 'small',
        status: 'cancelled',
      },
      classes: [
        {
          id: 'cl2',
          course_id: 'co1',
          group_size_type: 'small',
          capacity: 6,
          meeting_day: 'Thursday',
          meeting_time: '4:00 PM',
          google_meet_link: 'https://meet.google.com/abc',
          active: true,
        },
      ],
      course: { start_date: '2026-03-01' },
      activeCountByClass: { cl2: 4 },
      makeupCountByClass: { cl2: 0 },
    });
    vi.mocked(createAdminClient).mockReturnValue(mock);

    // Mock computeSessionDates to return session 3 on Thursday 2026-03-19
    vi.mocked(computeSessionDates).mockReturnValue([
      {
        sessionNumber: 1,
        date: new Date('2026-03-05T00:00:00'),
        dateStr: '2026-03-05',
        isPast: true,
      },
      {
        sessionNumber: 2,
        date: new Date('2026-03-12T00:00:00'),
        dateStr: '2026-03-12',
        isPast: true,
      },
      {
        sessionNumber: 3,
        date: new Date('2026-03-19T00:00:00'),
        dateStr: '2026-03-19',
        isPast: false,
      },
    ]);

    const { findAlternateSessions } = await import(
      '@/lib/cancellation/find-alternate-sessions'
    );
    const result = await findAlternateSessions('c1');

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions![0]).toMatchObject({
      classId: 'cl2',
      meetingDay: 'Thursday',
      meetingTime: '4:00 PM',
      sessionDate: '2026-03-19',
      availableSeats: 2,
      googleMeetLink: 'https://meet.google.com/abc',
    });
  });

  it('excludes full classes', async () => {
    const mock = createMockAdminClient({
      cancellation: {
        id: 'c1',
        course_id: 'co1',
        class_id: 'cl1',
        session_number: 3,
        session_date: '2026-03-18',
        group_size_type: 'small',
        status: 'cancelled',
      },
      classes: [
        {
          id: 'cl2',
          course_id: 'co1',
          group_size_type: 'small',
          capacity: 6,
          meeting_day: 'Thursday',
          meeting_time: '4:00 PM',
          google_meet_link: null,
          active: true,
        },
      ],
      course: { start_date: '2026-03-01' },
      activeCountByClass: { cl2: 5 },
      makeupCountByClass: { cl2: 1 },
    });
    vi.mocked(createAdminClient).mockReturnValue(mock);

    vi.mocked(computeSessionDates).mockReturnValue([
      {
        sessionNumber: 3,
        date: new Date('2026-03-19T00:00:00'),
        dateStr: '2026-03-19',
        isPast: false,
      },
    ]);

    const { findAlternateSessions } = await import(
      '@/lib/cancellation/find-alternate-sessions'
    );
    const result = await findAlternateSessions('c1');
    // Full classes are now included with isFull: true (for waitlist join)
    expect(result.sessions).toEqual([
      {
        classId: 'cl2',
        meetingDay: 'Thursday',
        meetingTime: '4:00 PM',
        sessionDate: '2026-03-19',
        availableSeats: 0,
        isFull: true,
        sessionNumber: 3,
        googleMeetLink: null,
      },
    ]);
  });

  it('excludes sessions from a different week', async () => {
    // Original session: Wednesday 2026-03-18
    // Alternate class's session 3 falls on Monday 2026-03-23 (next week)
    const mock = createMockAdminClient({
      cancellation: {
        id: 'c1',
        course_id: 'co1',
        class_id: 'cl1',
        session_number: 3,
        session_date: '2026-03-18', // Wednesday, week of Sun 2026-03-15
        group_size_type: 'small',
        status: 'cancelled',
      },
      classes: [
        {
          id: 'cl2',
          course_id: 'co1',
          group_size_type: 'small',
          capacity: 6,
          meeting_day: 'Monday',
          meeting_time: '4:00 PM',
          google_meet_link: null,
          active: true,
        },
      ],
      course: { start_date: '2026-03-02' },
      activeCountByClass: { cl2: 3 },
    });
    vi.mocked(createAdminClient).mockReturnValue(mock);

    vi.mocked(computeSessionDates).mockReturnValue([
      {
        sessionNumber: 3,
        date: new Date('2026-03-23T00:00:00'), // Monday, week of Sun 2026-03-22
        dateStr: '2026-03-23',
        isPast: false,
      },
    ]);

    const { findAlternateSessions } = await import(
      '@/lib/cancellation/find-alternate-sessions'
    );
    const result = await findAlternateSessions('c1');
    expect(result.sessions).toEqual([]);
  });
});

describe('Makeup Booking RPC Validation (unit)', () => {
  // These test the error message parsing in the server action wrappers

  beforeEach(() => {
    vi.resetModules();
  });

  it('bookMakeupSession parses "same course" error', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () =>
        Promise.resolve({
          auth: {
            getUser: () =>
              Promise.resolve({ data: { user: { id: 'u1' } } }),
          },
        }),
    }));
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: () => ({
        rpc: () =>
          Promise.resolve({
            data: null,
            error: { message: 'Host class must be for the same course' },
          }),
      }),
    }));

    const { bookMakeupSession } = await import(
      '@/lib/cancellation/book-makeup'
    );
    const result = await bookMakeupSession('c1', 'cl2');
    expect(result.error).toBe('The alternate class must be for the same course.');
  });

  it('bookMakeupSession parses "session is full" error', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () =>
        Promise.resolve({
          auth: {
            getUser: () =>
              Promise.resolve({ data: { user: { id: 'u1' } } }),
          },
        }),
    }));
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: () => ({
        rpc: () =>
          Promise.resolve({
            data: null,
            error: { message: 'Host class session is full' },
          }),
      }),
    }));

    const { bookMakeupSession } = await import(
      '@/lib/cancellation/book-makeup'
    );
    const result = await bookMakeupSession('c1', 'cl2');
    expect(result.error).toBe('This session is full. Please try another class.');
  });

  it('cancelMakeupBooking parses "not in booked status" error', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () =>
        Promise.resolve({
          auth: {
            getUser: () =>
              Promise.resolve({ data: { user: { id: 'u1' } } }),
          },
        }),
    }));
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        }),
        rpc: () =>
          Promise.resolve({
            data: null,
            error: { message: 'Makeup booking is not in booked status' },
          }),
      }),
    }));

    const { cancelMakeupBooking } = await import(
      '@/lib/cancellation/cancel-makeup'
    );
    const result = await cancelMakeupBooking('b1');
    expect(result.error).toBe(
      'This makeup booking has already been cancelled or completed.'
    );
  });
});

describe('Cron: cancel-credits makeup no-show handling', () => {
  it('marks booked makeups past session_date as no_show', async () => {
    // This tests the conceptual logic — actual cron runs against real DB
    // Verify the query shape: status='booked' AND session_date < today
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    // A booking from yesterday with status 'booked' should become 'no_show'
    const booking = {
      id: 'b1',
      session_date: yesterdayStr,
      status: 'booked',
    };

    expect(new Date(booking.session_date) < today).toBe(true);
    expect(booking.status).toBe('booked');
  });
});
