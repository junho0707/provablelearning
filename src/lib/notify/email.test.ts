import { describe, expect, it, vi, beforeEach } from "vitest";

// TASK-NOTIFY-001. Every sender must return a boolean, never throw — a failed send can't break
// the booking/purchase flow that triggered it, and the cron loop needs the boolean to decide
// whether flipping the idempotency flag is safe. Live delivery needs a real Resend account — not
// testable in this environment (see VERIFY.md).

const sendMock = vi.fn();

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(function Resend(this: { emails: { send: typeof sendMock } }) {
    this.emails = { send: sendMock };
  }),
}));

const { sendBookingConfirmation, sendReminder, sendReceipt } = await import("./email");

beforeEach(() => {
  sendMock.mockReset();
  process.env.RESEND_API_KEY = "re_test";
});

describe("sendBookingConfirmation", () => {
  it("returns true on success and includes the Meet link when present", async () => {
    sendMock.mockResolvedValue({ data: { id: "email_1" } });
    const ok = await sendBookingConfirmation({
      to: "buyer@example.com",
      startsAt: "2026-06-02T14:00:00.000Z",
      meetUrl: "https://meet.google.com/abc-defg-hij",
    });
    expect(ok).toBe(true);
    expect(sendMock.mock.calls[0][0].html).toContain("https://meet.google.com/abc-defg-hij");
  });

  it("omits a Meet link mention when null (INV-BOOK-2)", async () => {
    sendMock.mockResolvedValue({ data: { id: "email_1" } });
    await sendBookingConfirmation({ to: "buyer@example.com", startsAt: "2026-06-02T14:00:00.000Z", meetUrl: null });
    expect(sendMock.mock.calls[0][0].html).not.toContain("meet.google.com");
  });

  it("returns false (never throws) on a Resend failure", async () => {
    sendMock.mockRejectedValue(new Error("Resend is down"));
    await expect(
      sendBookingConfirmation({ to: "buyer@example.com", startsAt: "2026-06-02T14:00:00.000Z", meetUrl: null }),
    ).resolves.toBe(false);
  });
});

describe("sendReminder", () => {
  it("labels the 24h and 1h variants differently", async () => {
    sendMock.mockResolvedValue({ data: { id: "email_1" } });
    await sendReminder({ to: "a@example.com", startsAt: "2026-06-02T14:00:00.000Z", meetUrl: null, hoursOut: 24 });
    await sendReminder({ to: "a@example.com", startsAt: "2026-06-02T14:00:00.000Z", meetUrl: null, hoursOut: 1 });
    expect(sendMock.mock.calls[0][0].subject).toContain("tomorrow");
    expect(sendMock.mock.calls[1][0].subject).toContain("soon");
  });

  it("returns false (never throws) on a Resend failure", async () => {
    sendMock.mockRejectedValue(new Error("Resend is down"));
    await expect(
      sendReminder({ to: "a@example.com", startsAt: "2026-06-02T14:00:00.000Z", meetUrl: null, hoursOut: 1 }),
    ).resolves.toBe(false);
  });
});

describe("sendReceipt", () => {
  it("returns true on success", async () => {
    sendMock.mockResolvedValue({ data: { id: "email_1" } });
    const ok = await sendReceipt({ to: "buyer@example.com", sku: "credits_1", amountCents: 7500 });
    expect(ok).toBe(true);
    expect(sendMock.mock.calls[0][0].html).toContain("$75");
  });

  it("returns false (never throws) on a Resend failure", async () => {
    sendMock.mockRejectedValue(new Error("Resend is down"));
    await expect(sendReceipt({ to: "buyer@example.com", sku: "credits_1", amountCents: 7500 })).resolves.toBe(false);
  });
});
