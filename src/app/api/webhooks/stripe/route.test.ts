import { describe, expect, it, vi } from "vitest";

// TASK-BILLING-001. Signature verification and payload routing are testable without a live Stripe
// account by mocking `stripeClient()`; a completed checkout actually crediting the ledger needs a
// live Supabase project (process_purchase RPC) — not testable in this environment.

vi.mock("@/lib/billing/stripe", () => ({
  stripeClient: () => ({
    webhooks: {
      constructEvent: (body: string, signature: string) => {
        if (signature !== "valid-signature") throw new Error("invalid signature");
        return JSON.parse(body);
      },
    },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: vi.fn().mockResolvedValue({ error: null }),
  }),
}));

const { POST } = await import("./route");

function req(body: unknown, signature: string | null) {
  const headers = new Headers();
  if (signature) headers.set("stripe-signature", signature);
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/webhooks/stripe", () => {
  it("rejects a missing signature header (NFR-SEC-004)", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const res = await POST(req({ id: "evt_1" }, null));
    expect(res.status).toBe(400);
  });

  it("rejects an invalid signature", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const res = await POST(req({ id: "evt_1" }, "wrong-signature"));
    expect(res.status).toBe(400);
  });

  it("ignores event types other than checkout.session.completed", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const res = await POST(
      req({ id: "evt_1", type: "payment_intent.created", data: { object: {} } }, "valid-signature"),
    );
    expect(res.status).toBe(200);
  });

  it("rejects checkout.session.completed with missing purchase metadata", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const res = await POST(
      req(
        { id: "evt_1", type: "checkout.session.completed", data: { object: { id: "cs_1", metadata: {} } } },
        "valid-signature",
      ),
    );
    expect(res.status).toBe(400);
  });

  it("processes a well-formed checkout.session.completed", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const res = await POST(
      req(
        {
          id: "evt_1",
          type: "checkout.session.completed",
          data: {
            object: { id: "cs_1", metadata: { account_id: "acct_1", sku: "credits_1" } },
          },
        },
        "valid-signature",
      ),
    );
    expect(res.status).toBe(200);
  });
});
