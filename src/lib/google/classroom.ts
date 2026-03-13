import { google } from 'googleapis';
import { getAuthedClient } from './auth';

export async function createClassroomCourse({
  name,
  section,
  description,
}: {
  name: string;
  section: string;
  description?: string;
}): Promise<{ courseId: string; alternateLink: string; enrollmentCode: string } | null> {
  const auth = await getAuthedClient();
  const classroom = google.classroom({ version: 'v1', auth });

  try {
    const course = await classroom.courses.create({
      requestBody: {
        name,
        section,
        description: description || undefined,
        ownerId: 'me',
        courseState: 'ACTIVE',
      },
    });

    const courseId = course.data.id;
    const alternateLink = course.data.alternateLink;
    const enrollmentCode = course.data.enrollmentCode;

    if (!courseId) {
      console.error('Classroom course created but no ID returned');
      return null;
    }

    return {
      courseId,
      alternateLink: alternateLink || '',
      enrollmentCode: enrollmentCode || '',
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to create Google Classroom course:', message);
    return null;
  }
}

export async function inviteStudentToClassroom({
  classroomId,
  studentEmail,
  enrollmentCode,
}: {
  classroomId: string;
  studentEmail: string;
  enrollmentCode?: string | null;
}) {
  const auth = await getAuthedClient();
  const classroom = google.classroom({ version: 'v1', auth });

  // Try direct add (works for same-domain Workspace accounts only)
  try {
    const student = await classroom.courses.students.create({
      courseId: classroomId,
      enrollmentCode: enrollmentCode || undefined,
      requestBody: {
        userId: studentEmail,
      },
    });
    console.log(`Classroom: added ${studentEmail} to course ${classroomId}`);
    return { success: true, data: student.data };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('ALREADY_EXISTS')) {
      return { success: true, data: null, alreadyInvited: true };
    }
    // External Gmail users can't be added via API — they use the enrollment code to self-join
    if (message.includes('IllegalDomain') || message.includes('CannotDirectAdd')) {
      console.log(`Classroom: ${studentEmail} is external — student will self-join with enrollment code`);
      return { success: true, data: null, selfJoinRequired: true };
    }
    console.error(`Classroom add failed for ${studentEmail}:`, message);
    return { success: false, error: message };
  }
}

export async function deleteClassroomCourse(classroomId: string) {
  const auth = await getAuthedClient();
  const classroom = google.classroom({ version: 'v1', auth });

  try {
    // Archive the course first (required before deletion)
    await classroom.courses.patch({
      id: classroomId,
      updateMask: 'courseState',
      requestBody: { courseState: 'ARCHIVED' },
    });
    await classroom.courses.delete({ id: classroomId });
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('NOT_FOUND')) {
      return { success: true }; // Already gone
    }
    console.error('Failed to delete Google Classroom course:', message);
    return { success: false, error: message };
  }
}

export async function removeStudentFromClassroom({
  classroomId,
  studentEmail,
}: {
  classroomId: string;
  studentEmail: string;
}) {
  const auth = await getAuthedClient();
  const classroom = google.classroom({ version: 'v1', auth });

  // Try removing enrolled student first
  try {
    await classroom.courses.students.delete({
      courseId: classroomId,
      userId: studentEmail,
    });
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    // Student already removed
    if (message.includes('NOT_FOUND')) {
      // Fall through to check pending invitations
    } else {
      console.error('Classroom student removal failed:', message);
      return { success: false, error: message };
    }
  }

  // Fall back: remove pending invitation
  try {
    const invitations = await classroom.invitations.list({
      courseId: classroomId,
      userId: studentEmail,
    });

    const invite = invitations.data.invitations?.[0];
    if (invite?.id) {
      await classroom.invitations.delete({ id: invite.id });
    }
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('NOT_FOUND')) {
      return { success: true }; // Already gone
    }
    console.error('Classroom invitation removal failed:', message);
    return { success: false, error: message };
  }
}

export async function isStudentInClassroom(classroomId: string, studentEmail: string): Promise<boolean> {
  const auth = await getAuthedClient();
  const classroom = google.classroom({ version: 'v1', auth });

  try {
    await classroom.courses.students.get({
      courseId: classroomId,
      userId: studentEmail,
    });
    return true;
  } catch {
    return false;
  }
}
