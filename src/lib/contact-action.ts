"use server";

import { sendContactMessage } from "@/lib/notify/email";

export type ContactState = { status: "idle" | "sent" | "error"; message?: string };

/**
 * `company` is a honeypot: hidden from a person by CSS, but a scraping bot that fills every field
 * finds and fills it too. A non-empty value is treated as spam and answered as success, so the bot
 * gets no signal that it was caught and does not retry with a cleverer payload.
 */
export async function submitContactMessage(_prev: ContactState, formData: FormData): Promise<ContactState> {
  if (String(formData.get("company") ?? "").trim()) {
    return { status: "sent" };
  }

  const email = String(formData.get("email") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  if (!email || !message) return { status: "error", message: "Enter your email and a message." };

  const sent = await sendContactMessage({ fromEmail: email, message });
  if (!sent) return { status: "error", message: "Couldn't send that. Try again in a moment." };
  return { status: "sent" };
}
