import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { findAlternateSessions } from '@/lib/cancellation/find-alternate-sessions';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const cancellationId = searchParams.get('cancellation_id');
  const weekOffset = parseInt(searchParams.get('week_offset') || '0', 10);

  if (!cancellationId) {
    return NextResponse.json({ error: 'Missing cancellation_id' }, { status: 400 });
  }

  if (isNaN(weekOffset)) {
    return NextResponse.json({ error: 'Invalid week_offset' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Verify ownership: cancellation must belong to user's student or child
  const adminClient = createAdminClient();

  const { data: cancellation } = await adminClient
    .from('session_cancellations')
    .select('student_id')
    .eq('id', cancellationId)
    .single();

  if (!cancellation) {
    return NextResponse.json({ error: 'Cancellation not found' }, { status: 404 });
  }

  const { data: student } = await adminClient
    .from('students')
    .select('id, user_id, parent_id')
    .eq('id', cancellation.student_id)
    .single();

  if (!student) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }

  // Check admin, student, or parent
  const { data: userRow } = await adminClient
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  const isAdmin = userRow?.role === 'admin';
  const isOwner = student.user_id === user.id;
  const isParent = student.parent_id === user.id;

  if (!isAdmin && !isOwner && !isParent) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const result = await findAlternateSessions(cancellationId, weekOffset);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
