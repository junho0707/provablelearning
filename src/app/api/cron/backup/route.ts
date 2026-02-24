import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronSecret } from '@/lib/auth/verify-cron-secret';

export async function GET(request: Request) {
  if (!verifyCronSecret(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Export enrollments
  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('*');

  // Export performance_logs
  const { data: perfLogs } = await supabase
    .from('performance_logs')
    .select('*');

  // Export credits
  const { data: credits } = await supabase
    .from('credits')
    .select('*');

  // Convert to CSV
  const enrollmentsCsv = toCsv(enrollments || []);
  const perfLogsCsv = toCsv(perfLogs || []);
  const creditsCsv = toCsv(credits || []);

  // TODO: Upload to Google Drive backup folder
  // For now, return the data as JSON
  return NextResponse.json({
    timestamp: new Date().toISOString(),
    enrollments: enrollments?.length || 0,
    performance_logs: perfLogs?.length || 0,
    credits: credits?.length || 0,
  });
}

function toCsv(data: Record<string, unknown>[]): string {
  if (data.length === 0) return '';
  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers.map((h) => {
      const val = row[h];
      if (val === null || val === undefined) return '';
      const str = String(val);
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    }).join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}
