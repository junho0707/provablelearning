import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

export default async function AdminDashboard() {
  const supabase = await createClient();

  const [
    { count: classCount },
    { count: activeEnrollments },
    { count: studentCount },
    { count: pendingEnrollments },
  ] = await Promise.all([
    supabase.from('classes').select('*', { count: 'exact', head: true }),
    supabase.from('enrollments').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('students').select('*', { count: 'exact', head: true }),
    supabase.from('enrollments').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);

  const stats = [
    { label: 'Active Enrollments', value: activeEnrollments || 0, color: 'text-navy-700' },
    { label: 'Pending', value: pendingEnrollments || 0, color: 'text-gold-600' },
    { label: 'Students', value: studentCount || 0, color: 'text-navy-700' },
    { label: 'Classes', value: classCount || 0, color: 'text-navy-700' },
  ];

  const navItems = [
    { href: '/admin/classes', label: 'Classes', desc: 'Manage class schedules', count: classCount },
    { href: '/admin/students', label: 'Students', desc: 'View student profiles', count: studentCount },
    { href: '/admin/performance', label: 'Performance', desc: 'Log & track progress', count: null },
    { href: '/admin/credits', label: 'Credits', desc: 'Manage makeup credits', count: null },
    { href: '/admin/refund-requests', label: 'Refund Requests', desc: 'Review refund cases', count: null },
    { href: '/admin/makeups', label: 'Makeups', desc: 'Makeup bookings', count: null },
    { href: '/admin/messages', label: 'Messages', desc: 'Parent & student messages', count: null },
    { href: '/admin/bookings', label: 'Bookings', desc: 'Consultation bookings', count: null },
    { href: '/admin/calendar', label: 'Calendar', desc: 'Schedule overview', count: null },
    { href: '/admin/logs', label: 'Audit Log', desc: 'System activity', count: null },
    { href: '/admin/export', label: 'Export', desc: 'Download data', count: null },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">Admin Dashboard</h1>
        <p className="text-slate-500">Overview of classes, enrollments, and students.</p>
      </div>

      {/* KPI Cards */}
      <div className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl border border-slate-200 bg-white p-5">
            <p className={`text-3xl font-semibold ${stat.color}`}>{stat.value}</p>
            <p className="mt-1 text-sm text-slate-500">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Navigation Grid */}
      <h2 className="mb-4 text-xs font-bold text-navy-500 uppercase tracking-widest">Manage</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group rounded-xl border border-slate-200 bg-white p-5 hover:border-navy-300 hover:shadow-md transition-all"
          >
            <p className="font-semibold text-navy-900 group-hover:text-navy-700">{item.label}</p>
            <p className="mt-0.5 text-sm text-slate-400">{item.desc}</p>
            {item.count !== null && (
              <p className="mt-2 text-xs font-medium text-gold-600">{item.count} total</p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
