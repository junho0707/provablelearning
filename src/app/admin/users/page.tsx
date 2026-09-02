import { listUsers } from "@/lib/admin/users";

export const metadata = { title: "Admin — users" };

/** TASK-ADMIN-001, contract `listUsers`. */
export default async function UsersPage() {
  const users = await listUsers();

  return (
    <div>
      <h1 className="mb-6 text-xl font-extrabold text-navy-950">Users</h1>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-navy-100 text-navy-500">
            <th className="py-2">Email</th>
            <th className="py-2">Admin</th>
            <th className="py-2">Joined</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-navy-50">
              <td className="py-2">{u.email}</td>
              <td className="py-2">{u.isAdmin ? "Yes" : ""}</td>
              <td className="py-2">{new Date(u.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
