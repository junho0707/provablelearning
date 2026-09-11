import { revalidatePath } from "next/cache";

/**
 * A student appears on two pages, so a change to one has to invalidate both. `router.refresh()`
 * in the client only refetches the route the buyer is standing on — which is why adding a student
 * from `/account` left `/dashboard` showing the old list until a hard reload.
 *
 * Not in a `"use server"` module on purpose: those may only export async functions.
 */
export function revalidateStudentSurfaces() {
  revalidatePath("/account");
  revalidatePath("/dashboard");
}
