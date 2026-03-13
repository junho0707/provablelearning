import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { deleteClassCalendarBlock } from '@/lib/google/calendar';
import { deleteClassroomCourse } from '@/lib/google/classroom';

/**
 * POST /api/google/nuke-classes
 * DEV ONLY — Deletes ALL classes, their Google Calendar events, Classroom courses,
 * and all related data (enrollments, cancellations, makeups, waitlists, etc.)
 */
export async function POST() {
  console.log('[nuke-classes] Starting full reset...');

  const supabase = await createClient();
  const admin = createAdminClient();

  // Verify admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: profile } = await admin.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // 1. Fetch all classes with their Google IDs
  const { data: classes } = await admin
    .from('classes')
    .select('id, name, google_calendar_event_id, google_calendar_event_id_2, google_classroom_id');

  const allClasses = classes || [];
  console.log(`[nuke-classes] Found ${allClasses.length} classes to delete`);

  // 2. Delete Google Calendar events + Classroom courses
  const calendarDeleted: string[] = [];
  const classroomDeleted: string[] = [];
  const errors: string[] = [];

  // Collect unique classroom IDs (SG shares classrooms)
  const uniqueClassroomIds = new Set<string>();

  for (const cls of allClasses) {
    // Calendar event 1
    if (cls.google_calendar_event_id) {
      try {
        await deleteClassCalendarBlock(cls.google_calendar_event_id);
        calendarDeleted.push(cls.google_calendar_event_id);
        console.log(`[nuke-classes] Deleted calendar event: ${cls.google_calendar_event_id} (${cls.name})`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // NOT_FOUND is fine — already gone
        if (!msg.includes('Not Found') && !msg.includes('404')) {
          errors.push(`cal ${cls.google_calendar_event_id}: ${msg}`);
        }
      }
    }

    // Calendar event 2
    if (cls.google_calendar_event_id_2) {
      try {
        await deleteClassCalendarBlock(cls.google_calendar_event_id_2);
        calendarDeleted.push(cls.google_calendar_event_id_2);
        console.log(`[nuke-classes] Deleted calendar event 2: ${cls.google_calendar_event_id_2} (${cls.name})`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('Not Found') && !msg.includes('404')) {
          errors.push(`cal2 ${cls.google_calendar_event_id_2}: ${msg}`);
        }
      }
    }

    // Classroom (deduplicate — SG shares)
    if (cls.google_classroom_id) {
      uniqueClassroomIds.add(cls.google_classroom_id);
    }
  }

  // Delete unique classrooms
  for (const classroomId of uniqueClassroomIds) {
    try {
      await deleteClassroomCourse(classroomId);
      classroomDeleted.push(classroomId);
      console.log(`[nuke-classes] Deleted Classroom: ${classroomId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('NOT_FOUND')) {
        errors.push(`classroom ${classroomId}: ${msg}`);
      }
    }
  }

  // 3. Cascade delete all related DB data (order matters for FK constraints)
  console.log('[nuke-classes] Clearing database tables...');

  // Tables referencing classes/enrollments
  await admin.from('performance_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('makeup_bookings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('makeup_waitlist').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('session_cancellations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('credits').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('refund_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('waitlist_notify_queue').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('waitlist').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('enrollments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('classes').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  console.log('[nuke-classes] Done!');

  return NextResponse.json({
    message: 'Full reset complete',
    classes_deleted: allClasses.length,
    calendar_events_deleted: calendarDeleted.length,
    classrooms_deleted: classroomDeleted.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}
