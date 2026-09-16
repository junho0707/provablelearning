import { describe, expect, it, vi, beforeEach } from "vitest";

// TASK-NOTIFY-001, contract `GET /api/cron/session-reminders`. Auth guard + query-shape are
// testable without a live Supabase project; the actual send/idempotency behavior is covered in
// `src/lib/notify/booking.test.ts`.

const selectChain = {
  eq: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(),
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
  delete process.env.CRON_HEARTBEAT_URL;
  vi.unstubAllGlobals();
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
    expect(body).toEqual({ sent24h: 0, sent1h: 0, overdue: 0 });
    // Two reminder windows plus the materials band that goes overdue during this tick.
    expect(fromMock).toHaveBeenCalledTimes(3);
  });

  // The tick is wrapped so a throw reaches the operator instead of vanishing; it must still say
  // so in the response, because a 200 would tell Vercel the hour's reminders went out.
  it("reports a failed tick as a 500", async () => {
    selectChain.lt.mockRejectedValueOnce(new Error("supabase unreachable"));
    const res = await GET(req("Bearer test-secret"));
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("cron_failed");
  });

  it("pings the heartbeat after a completed tick", async () => {
    process.env.CRON_HEARTBEAT_URL = "https://uptime.example/heartbeat/abc";
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchSpy);

    await GET(req("Bearer test-secret"));
    expect(fetchSpy).toHaveBeenCalledWith("https://uptime.example/heartbeat/abc", { method: "GET" });
  });

  // A tick that failed must look exactly like a tick that never ran, or the monitor reports a
  // broken cron as healthy — which is the one thing a dead-man's switch exists to prevent.
  it("does not ping the heartbeat when the tick failed", async () => {
    process.env.CRON_HEARTBEAT_URL = "https://uptime.example/heartbeat/abc";
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchSpy);
    selectChain.lt.mockRejectedValueOnce(new Error("supabase unreachable"));

    await GET(req("Bearer test-secret"));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
