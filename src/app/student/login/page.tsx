import { redirect } from "next/navigation";
import { StudentLoginForm } from "@/components/auth/student-login-form";
import { currentStudent } from "@/lib/auth/session";
import { H1 } from "@/lib/ui";

export const metadata = { title: "Student sign in" };

export default async function StudentLoginPage() {
  if (await currentStudent()) redirect("/student");

  return (
    // The shell already paints the ground; this page only has to centre itself on it.
    <main className="mx-auto flex min-h-screen max-w-[26rem] flex-col justify-center gap-8 px-6 py-16 sm:px-10">
      <div>
        <h1 className={H1}>Student sign in</h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-navy-700">
          Use the username and password your parent set up for you.
        </p>
      </div>

      <StudentLoginForm />
    </main>
  );
}
