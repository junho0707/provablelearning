import { redirect } from "next/navigation";

/** Booking merged into /sessions alongside credits; kept so existing links keep working. */
export default function BookRedirect() {
  redirect("/sessions");
}
