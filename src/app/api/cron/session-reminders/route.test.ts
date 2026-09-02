import { describe, expect, it, vi, beforeEach } from "vitest";

// TASK-NOTIFY-001, contract `GET /api/cron/session-reminders`. Auth guard + query-shape are
// testable without a live Supabase project; the actual send/idempotency behavior is covered in
// `src/lib/notify/booking.test.ts`.

const selectChain = {
  eq: vi.fn().mockReturnThis(),
  gte: vi.fn().mockReturnThis(),
  lt: vi.fn().mockResolvedValue({ data: [] }),
};
const fromMock = vi.fn(() => ({ select: vi.fn(() => selectChain) }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: fromMock }),
}));

vi.mock("@/lib/notify/booking", () => ({
  sendReminderForBooking: vi.fn(),
}));

const { GET } = await import("./route");

function req(authHeader: string | null) {
  const headers = new Headers();
  if (authHeader) headers.set("authorization", authHeader);
  return new Request("http://localhost/api/cron/session-reminders", { headers });
}

beforeEach(() => {
  process.env.CRON_SECRET = "test-secret";
  fromMock.mockClear();
});

describe("GET /api/cron/session-reminders", () => {
  it("rejects a missing authorization header", async () => {
    const res = await GET(req(null));
    expect(res.status).toBe(401);
  });

  it("rejects an incorrect secret", async () => {
    const res = await GET(req("Bearer wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("accepts the correct secret and queries both reminder windows", async () => {
    const res = await GET(req("Bearer test-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ sent24h: 0, sent1h: 0 });
    expect(fromMock).toHaveBeenCalledTimes(2);
  });
});
