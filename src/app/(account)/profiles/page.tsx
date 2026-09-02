import { redirect } from "next/navigation";

/** Profiles merged into /account; kept so existing links keep working. */
export default function ProfilesRedirect() {
  redirect("/account");
}
