import { describe, expect, it, vi } from "vitest";

const limitMock = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ limit: limitMock }) }),
  }),
}));

const { GET } = await import("./route");

describe("GET /api/health", () => {
  it("is 200 when Supabase answers", async () => {
    limitMock.mockResolvedValueOnce({ data: [], error: null });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  // The whole point: a deployment that serves HTML but cannot reach the database is down, and
  // must say so in the status code an uptime monitor reads.
  it("is 503 when the query errors", async () => {
    limitMock.mockResolvedValueOnce({ data: null, error: { message: "connection refused" } });
    const res = await GET();
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("database_unreachable");
  });

  it("is 503 when the client throws", async () => {
    limitMock.mockRejectedValueOnce(new Error("socket hang up"));
    expect((await GET()).status).toBe(503);
  });
});
