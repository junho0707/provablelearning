import { describe, expect, it, vi, beforeEach } from "vitest";

// TASK-BOOK-003, S10/AT-BOOK-006. `createCalendarEvent` must never throw — a Google outage has to
// leave a valid booking with a missing link, not lose the booking. Mocking `googleapis` lets us
// exercise both the happy path and every failure shape without a live Google account; the actual
// end-to-end (real Calendar API, real Meet link, admin-queue visibility of a null `meet_url`)
// needs one — not testable in this environment (see VERIFY.md).

const insertMock = vi.fn();
const deleteMock = vi.fn();
const patchMock = vi.fn();

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(function OAuth2(this: { setCredentials: () => void }) {
        this.setCredentials = vi.fn();
      }),
    },
    calendar: vi.fn().mockReturnValue({
      events: { insert: insertMock, delete: deleteMock, patch: patchMock },
    }),
  },
}));

const { createCalendarEvent, cancelCalendarEvent, updateCalendarEventTime } = await import("./calendar");

beforeEach(() => {
  insertMock.mockReset();
  deleteMock.mockReset();
  patchMock.mockReset();
});

describe("createCalendarEvent", () => {
  const params = {
    bookingId: "booking-1",
    startsAt: "2026-06-02T14:00:00.000Z",
    learnerName: "Ada",
    buyerEmail: "buyer@example.com",
  };

  it("returns the event id and Meet link on success", async () => {
    insertMock.mockResolvedValue({ data: { id: "evt_1", hangoutLink: "https://meet.google.com/abc-defg-hij" } });
    const result = await createCalendarEvent(params);
    expect(result).toEqual({ eventId: "evt_1", meetUrl: "https://meet.google.com/abc-defg-hij" });
  });

  it("invites the buyer and requests a Meet link", async () => {
    insertMock.mockResolvedValue({ data: { id: "evt_1", hangoutLink: "https://meet.google.com/abc-defg-hij" } });
    await createCalendarEvent(params);
    const call = insertMock.mock.calls[0][0];
    expect(call.requestBody.attendees).toEqual([{ email: "buyer@example.com" }]);
    expect(call.requestBody.conferenceData.createRequest.conferenceSolutionKey.type).toBe("hangoutsMeet");
    expect(call.conferenceDataVersion).toBe(1);
  });

  it("returns null (never throws) when the Google API call rejects", async () => {
    insertMock.mockRejectedValue(new Error("Google is down"));
    await expect(createCalendarEvent(params)).resolves.toBeNull();
  });

  it("returns null when Google succeeds but omits a Meet link", async () => {
    insertMock.mockResolvedValue({ data: { id: "evt_1", hangoutLink: null } });
    const result = await createCalendarEvent(params);
    expect(result).toBeNull();
  });
});

describe("cancelCalendarEvent / updateCalendarEventTime — best-effort, never throw", () => {
  it("cancelCalendarEvent swallows a Google failure", async () => {
    deleteMock.mockRejectedValue(new Error("Google is down"));
    await expect(cancelCalendarEvent("evt_1")).resolves.toBeUndefined();
  });

  it("updateCalendarEventTime swallows a Google failure", async () => {
    patchMock.mockRejectedValue(new Error("Google is down"));
    await expect(updateCalendarEventTime("evt_1", "2026-06-02T15:00:00.000Z")).resolves.toBeUndefined();
  });
});
