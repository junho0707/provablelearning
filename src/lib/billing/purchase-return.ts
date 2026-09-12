/**
 * What `?purchase=` on a Stripe return URL means to the page that reads it.
 *
 * Shared by the three pages a checkout can return to, so they cannot disagree about what counts
 * as "just paid".
 */
export function purchaseReturn(param: string | undefined): {
  paid: boolean;
  sessionId: string | null;
} {
  const paid = !!param && param !== "cancelled";
  return {
    paid,
    // Checkouts started before the id was carried back say "success" instead. There is nothing
    // precise for the notice to watch in that case, and it says so rather than inventing one.
    sessionId: paid && param!.startsWith("cs_") ? param! : null,
  };
}
