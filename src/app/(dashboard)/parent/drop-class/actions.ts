'use server';

import { redirect } from 'next/navigation';
import { dropEnrollment } from '@/lib/enrollment/drop';

export async function dropClassAction(formData: FormData) {
  const enrollmentId = formData.get('enrollment_id') as string;
  const reason = (formData.get('reason') as string)?.trim();

  if (!enrollmentId) {
    return { error: 'Enrollment ID is required.' };
  }

  if (!reason) {
    return { error: 'Please provide a reason for dropping this class.' };
  }

  const result = await dropEnrollment(enrollmentId, reason);

  if (result.error) {
    return { error: result.error };
  }

  redirect('/parent?dropped=1');
}

export async function noteDropAction(formData: FormData) {
  const enrollmentId = formData.get('enrollment_id') as string;
  const note = (formData.get('note') as string)?.trim();

  if (!enrollmentId) {
    return { error: 'Enrollment ID is required.' };
  }

  if (!note) {
    return { error: 'Please leave a note for the admin.' };
  }

  const result = await dropEnrollment(enrollmentId, note, 2);

  if (result.error) {
    return { error: result.error };
  }

  redirect('/parent?dropped=1');
}
