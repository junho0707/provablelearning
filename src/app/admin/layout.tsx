import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";

/** TASK-ADMIN-001. Every admin page sits under this gate (AT-SEC-002). */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  if (!admin.ok) redirect("/login?next=/admin");

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <nav className="mb-8 flex flex-wrap gap-4 border-b border-navy-100 pb-4 text-sm font-semibold text-navy-700">
        <Link href="/admin" className="hover:text-navy-950">
          Admin
        </Link>
        <Link href="/admin/bookings" className="hover:text-navy-950">
          Bookings
        </Link>
        <Link href="/admin/materials" className="hover:text-navy-950">
          Materials
        </Link>
        <Link href="/admin/availability" className="hover:text-navy-950">
          Availability
        </Link>
        <Link href="/admin/diagnostics" className="hover:text-navy-950">
          Diagnostics
        </Link>
        <Link href="/admin/messages" className="hover:text-navy-950">
          Messages
        </Link>
        <Link href="/admin/credit-returns" className="hover:text-navy-950">
          Credit returns
        </Link>
        <Link href="/admin/users" className="hover:text-navy-950">
          Users
        </Link>
        <Link href="/admin/questions" className="hover:text-navy-950">
          Questions
        </Link>
        <Link href="/admin/reminders" className="hover:text-navy-950">
          SMS reminders
        </Link>
      </nav>
      {children}
    </div>
  );
}
