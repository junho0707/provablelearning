import { google } from 'googleapis';
import { getAuthedClient } from './auth';

export async function inviteStudentToClassroom({
  classroomId,
  studentEmail,
}: {
  classroomId: string;
  studentEmail: string;
}) {
  const auth = await getAuthedClient();
  const classroom = google.classroom({ version: 'v1', auth });

  try {
    const invitation = await classroom.invitations.create({
      requestBody: {
        courseId: classroomId,
        userId: studentEmail,
        role: 'STUDENT',
      },
    });
    return { success: true, data: invitation.data };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    // Don't throw on duplicate invites
    if (message.includes('ALREADY_EXISTS')) {
      return { success: true, data: null, alreadyInvited: true };
    }
    console.error('Classroom invite failed:', message);
    return { success: false, error: message };
  }
}
