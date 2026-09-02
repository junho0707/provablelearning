import { describe, expect, it, vi, beforeEach } from "vitest";

// TASK-NOTIFY-001, AT-NOTIFY-001. The idempotency guarantee ("cron reruns produce no duplicates")
// lives in `sendReminderForBooking`: the flag column is only flipped when the send actually
// succeeds. This exercises that decision directly, without a live Resend/Supabase project.

const updateEqMock = vi.fn().mockResolvedValue({ error: null });
const updateMock = vi.fn(() => ({ eq: updateEqMock }));
const getUserByIdMock = vi.fn();
const sendReminderMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: { admin: { getUserById: getUserByIdMock } },
    from: () => ({ update: updateMock }),
  }),
}));

vi.mock("./email", () => ({
  sendReminder: sendReminderMock,
  sendBookingConfirmation: vi.fn(),
}));

const { sendReminderForBooking } = await import("./booking");

const booking = { id: "booking-1", starts_at: "2026-06-02T14:00:00.000Z", meet_url: null, account_id: "acct-1" };

beforeEach(() => {
  updateEqMock.mockClear();
  updateMock.mockClear();
  getUserByIdMock.mockReset();
  sendReminderMock.mockReset();
});

describe("sendReminderForBooking", () => {
  it("flips the flag when the send succeeds", async () => {
    getUserByIdMock.mockResolvedValue({ data: { user: { email: "buyer@example.com" } } });
    sendReminderMock.mockResolvedValue(true);

    const ok = await sendReminderForBooking(booking, 24, "reminded_24h");

    expect(ok).toBe(true);
    expect(updateMock).toHaveBeenCalledWith({ reminded_24h: true });
    expect(updateEqMock).toHaveBeenCalledWith("id", "booking-1");
  });

  it("does not flip the flag when the send fails — safe to retry next cron tick", async () => {
    getUserByIdMock.mockResolvedValue({ data: { user: { email: "buyer@example.com" } } });
    sendReminderMock.mockResolvedValue(false);

    const ok = await sendReminderForBooking(booking, 1, "reminded_1h");

    expect(ok).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("does not flip the flag when the buyer has no resolvable email", async () => {
    getUserByIdMock.mockResolvedValue({ data: { user: null } });

    const ok = await sendReminderForBooking(booking, 24, "reminded_24h");

    expect(ok).toBe(false);
    expect(sendReminderMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});
