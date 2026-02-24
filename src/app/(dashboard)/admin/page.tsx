import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

export default async function AdminDashboard() {
  const supabase = await createClient();

  const [
    { count: courseCount },
    { count: classCount },
    { count: activeEnrollments },
    { count: studentCount },
    { count: pendingEnrollments },
    { count: makeupSessionCount },
  ] = await Promise.all([
    supabase.from('courses').select('*', { count: 'exact', head: true }),
    supabase.from('classes').select('*', { count: 'exact', head: true }),
    supabase.from('enrollments').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('students').select('*', { count: 'exact', head: true }),
    supabase.from('enrollments').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('makeup_sessions').select('*', { count: 'exact', head: true }).eq('active', true),
  ]);

  const navItems = [
    { href: '/admin/courses', label: 'Courses', count: courseCount },
    { href: '/admin/classes', label: 'Classes', count: classCount },
    { href: '/admin/students', label: 'Students', count: studentCount },
    { href: '/admin/performance', label: 'Performance', count: null },
    { href: '/admin/credits', label: 'Credits', count: null },
    { href: '/admin/refunds', label: 'Refunds', count: null },
    { href: '/admin/makeup-sessions', label: 'Makeup Sessions', count: makeupSessionCount },
    { href: '/admin/makeups', label: 'Makeups', count: null },
    { href: '/admin/messages', label: 'Messages', count: null },
    { href: '/admin/refund-requests', label: 'Refund Requests', count: null },
    { href: '/admin/calendar', label: 'Calendar', count: null },
    { href: '/admin/logs', label: 'Audit Log', count: null },
    { href: '/admin/export', label: 'Export', count: null },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="border rounded-lg p-4 text-center">
          <p className="text-3xl font-bold">{activeEnrollments || 0}</p>
          <p className="text-sm text-gray-500">Active Enrollments</p>
        </div>
        <div className="border rounded-lg p-4 text-center">
          <p className="text-3xl font-bold">{pendingEnrollments || 0}</p>
          <p className="text-sm text-gray-500">Pending</p>
        </div>
        <div className="border rounded-lg p-4 text-center">
          <p className="text-3xl font-bold">{studentCount || 0}</p>
          <p className="text-sm text-gray-500">Students</p>
        </div>
        <div className="border rounded-lg p-4 text-center">
          <p className="text-3xl font-bold">{courseCount || 0}</p>
          <p className="text-sm text-gray-500">Courses</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="border rounded-lg p-4 hover:bg-gray-50 block"
          >
            <p className="font-medium">{item.label}</p>
            {item.count !== null && (
              <p className="text-sm text-gray-500">{item.count} total</p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
