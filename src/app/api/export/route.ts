import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const supabase = await createClient();

  // Verify admin
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  const validTables = ['enrollments', 'performance_logs', 'credits', 'students'];
  if (!type || !validTables.includes(type)) {
    return NextResponse.json({ error: 'Invalid export type' }, { status: 400 });
  }

  const { data } = await supabase.from(type).select('*');

  if (!data || data.length === 0) {
    return new Response('No data', { status: 200, headers: { 'Content-Type': 'text/csv' } });
  }

  const headers = Object.keys(data[0]);
  const csv = [
    headers.join(','),
    ...data.map((row) =>
      headers
        .map((h) => {
          const val = (row as Record<string, unknown>)[h];
          if (val === null || val === undefined) return '';
          const str = String(val);
          return str.includes(',') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        })
        .join(',')
    ),
  ].join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${type}_${new Date().toISOString().split('T')[0]}.csv"`,
    },
  });
}
