import { redirect } from "next/navigation";
import { StudentLoginForm } from "@/components/auth/student-login-form";
import { currentStudent } from "@/lib/auth/session";

export const metadata = { title: "Student sign in" };

export default async function StudentLoginPage() {
  if (await currentStudent()) redirect("/student");

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-5 py-16">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-navy-950">Student sign in</h1>
        <p className="mt-2 text-navy-700">
          Use the username and password your parent set up for you.
        </p>
      </div>

      <StudentLoginForm />
    </main>
  );
}
