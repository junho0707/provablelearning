import { redirect } from "next/navigation";

/** Renamed to /credits; kept so Stripe return URLs and older links keep working. */
export default function WalletRedirect() {
  redirect("/credits");
}
