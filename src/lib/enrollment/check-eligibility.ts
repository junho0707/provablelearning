import { SupabaseClient } from '@supabase/supabase-js';

interface EligibilityResult {
  eligible: boolean;
  reason?: string;
}

export async function checkEligibility(
  supabase: SupabaseClient,
  studentId: string,
  classId: string,
  courseId: string
): Promise<EligibilityResult> {
  // 1a. Check for duplicate enrollment (student+class, active/pending only)
  const { count: dupClass } = await supabase
    .from('enrollments')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .eq('class_id', classId)
    .in('status', ['pending', 'active']);

  if (dupClass && dupClass > 0) {
    return { eligible: false, reason: 'Already enrolled in this class.' };
  }

  // 1a-2. Check if re-enrollment is blocked for this class (Phase 2 drop)
  const { count: blockedCount } = await supabase
    .from('enrollments')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .eq('class_id', classId)
    .eq('class_blocked', true);

  if (blockedCount && blockedCount > 0) {
    return {
      eligible: false,
      reason:
        'Re-enrollment into this class is not available. You may enroll in a different section.',
    };
  }

  // 1b. Check for duplicate enrollment in same course (any class)
  const { count: dupCourse } = await supabase
    .from('enrollments')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .eq('course_id', courseId)
    .in('status', ['pending', 'active']);

  if (dupCourse && dupCourse > 0) {
    return { eligible: false, reason: 'Already enrolled in another class for this course.' };
  }

  // 2. Check course hasn't started
  const { data: course } = await supabase
    .from('courses')
    .select('start_date, subject, max_reenroll')
    .eq('id', courseId)
    .single();

  if (!course) {
    return { eligible: false, reason: 'Course not found.' };
  }

  if (new Date(course.start_date) <= new Date()) {
    return { eligible: false, reason: 'Course has already started.' };
  }

  // 4. Check re-enrollment limit (per course, not per subject — student can't take the same course more than max_reenroll times)
  const { count: reenrollCount } = await supabase
    .from('enrollments')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .eq('course_id', courseId)
    .in('status', ['active', 'completed']);

  if (reenrollCount && reenrollCount >= course.max_reenroll) {
    return {
      eligible: false,
      reason: `Re-enrollment limit reached (${course.max_reenroll}) for this course.`,
    };
  }

  // 5. Check time conflict with other active enrollments
  const { data: cls } = await supabase
    .from('classes')
    .select('meeting_day, meeting_time, course_id')
    .eq('id', classId)
    .single();

  if (!cls) {
    return { eligible: false, reason: 'Class not found.' };
  }

  // Validate class belongs to the specified course
  if (cls.course_id !== courseId) {
    return { eligible: false, reason: 'Class does not belong to this course.' };
  }

  if (cls) {
    const { data: conflicts } = await supabase
      .from('enrollments')
      .select('class_id, classes!inner(meeting_day, meeting_time)')
      .eq('student_id', studentId)
      .in('status', ['pending', 'active'])
      .eq('classes.meeting_day', cls.meeting_day)
      .eq('classes.meeting_time', cls.meeting_time);

    if (conflicts && conflicts.length > 0) {
      return { eligible: false, reason: 'Time conflict with an existing enrollment.' };
    }
  }

  return { eligible: true };
}
