import { afterEach, describe, expect, it, vi } from "vitest";
import { notifyOperator } from "./slack";

const WEBHOOK = "https://hooks.slack.com/services/T000/B000/xxx";

afterEach(() => {
  delete process.env.SLACK_WEBHOOK_URL;
  vi.unstubAllGlobals();
});

describe("notifyOperator", () => {
  it("is a silent no-op with no webhook configured", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    expect(await notifyOperator("anything")).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts the text to the webhook", async () => {
    process.env.SLACK_WEBHOOK_URL = WEBHOOK;
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchSpy);

    expect(await notifyOperator("📅 Booked")).toBe(true);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(WEBHOOK);
    expect(JSON.parse(init.body)).toEqual({ text: "📅 Booked" });
  });

  // The whole point of the boolean: a Slack outage during a booking must be a missed alert, never
  // a failed booking.
  it("swallows a transport failure", async () => {
    process.env.SLACK_WEBHOOK_URL = WEBHOOK;
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    expect(await notifyOperator("📅 Booked")).toBe(false);
  });

  it("reports a non-2xx as a failed send", async () => {
    process.env.SLACK_WEBHOOK_URL = WEBHOOK;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    expect(await notifyOperator("📅 Booked")).toBe(false);
  });
});
