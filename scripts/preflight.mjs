/**
 * Preflight — checks every credential the flow walkthrough needs, before you walk it.
 *
 * `npm run preflight`. Reads `.env.local`, then actually calls each service rather than only
 * checking that a variable is non-empty: a wrong key and a missing key fail in different places
 * and only one of them is obvious. Read-only — it creates nothing and charges nothing.
 */

import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((line) => /^[A-Z]/.test(line))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at), line.slice(at + 1).trim()];
    }),
);

/**
 * WSL's DNS drops requests intermittently, and a transient `ENOTFOUND` reads exactly like a bad
 * credential unless it is retried. Two retries is enough to tell the two apart.
 */
async function request(url, options) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(url, options);
    } catch (e) {
      if (attempt === 2) throw e;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
}

const results = [];
const ok = (name, detail) => results.push({ state: "ok", name, detail });
const bad = (name, detail) => results.push({ state: "bad", name, detail });
const skip = (name, detail) => results.push({ state: "skip", name, detail });

// --- Supabase ---------------------------------------------------------------------------------

async function checkSupabase() {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return bad("Supabase", "URL or service-role key missing");

  // `messages` only exists once 0022 has been applied, so this doubles as a migration check.
  const res = await request(`${url}/rest/v1/messages?select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (res.ok) return ok("Supabase", `${new URL(url).hostname} — schema through 0023`);
  bad("Supabase", `${res.status} — migrations may not be applied`);
}

// --- Stripe -----------------------------------------------------------------------------------

const PRICES = {
  STRIPE_PRICE_FIRST_SESSION: 4900,
  STRIPE_PRICE_CREDITS_1: 7500,
  STRIPE_PRICE_CREDITS_2: 12000,
  STRIPE_PRICE_CREDITS_4: 20000,
  STRIPE_PRICE_CREDITS_8: 35000,
};

async function checkStripe() {
  const key = env.STRIPE_SECRET_KEY;
  if (!key) return bad("Stripe", "STRIPE_SECRET_KEY missing");

  const mode = key.startsWith("sk_live") ? "LIVE" : "test";
  const account = await request("https://api.stripe.com/v1/account", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!account.ok) return bad("Stripe", `key rejected (${account.status})`);
  ok("Stripe key", `${mode} mode`);

  // The amount is checked, not just the id's existence: charging one number and granting credits
  // for another is the failure this catches (AT-MONEY-6).
  for (const [envVar, expected] of Object.entries(PRICES)) {
    const id = env[envVar];
    if (!id) {
      bad(envVar, "not set — checkout throws");
      continue;
    }
    const res = await request(`https://api.stripe.com/v1/prices/${id}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      bad(envVar, `${id} not found in ${mode} mode`);
      continue;
    }
    const price = await res.json();
    if (price.unit_amount !== expected) {
      bad(envVar, `charges $${price.unit_amount / 100}, pricing.ts says $${expected / 100}`);
    } else if (price.recurring) {
      bad(envVar, "is a recurring price — must be one-time");
    } else {
      ok(envVar, `$${expected / 100}`);
    }
  }
}

// --- Google -----------------------------------------------------------------------------------

async function checkGoogle() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_BOOKING_CALENDAR_ID } = env;
  if (!GOOGLE_REFRESH_TOKEN) {
    return bad("Google", "GOOGLE_REFRESH_TOKEN missing — every booking gets a null meet_url");
  }

  const token = await request("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  if (!token.ok) {
    const body = await token.json().catch(() => ({}));
    return bad("Google token", `${body.error ?? token.status} — token may belong to another OAuth client`);
  }
  const { access_token, scope } = await token.json();
  ok("Google token", "refresh token exchanges cleanly");

  // A read-only scope mints a token fine and then fails at the first booking, so check the scope
  // rather than only the exchange.
  if (scope && !/auth\/calendar(\s|$)/.test(scope) && !scope.includes("calendar.events")) {
    bad("Google scope", `${scope} — needs calendar write to create Meet links`);
  }

  const calendarId = GOOGLE_BOOKING_CALENDAR_ID ?? "primary";
  const cal = await request(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}`,
    { headers: { Authorization: `Bearer ${access_token}` } },
  );
  if (cal.ok) {
    const body = await cal.json();
    ok("Booking calendar", body.summary ?? calendarId);
  } else {
    bad("Booking calendar", `${cal.status} on ${calendarId} — this account may not have access`);
  }
}

// --- Resend -----------------------------------------------------------------------------------

async function checkResend() {
  const key = env.RESEND_API_KEY;
  if (!key) return bad("Resend", "RESEND_API_KEY missing");

  const res = await request("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) return bad("Resend", `key rejected (${res.status})`);

  const { data = [] } = await res.json();
  const from = (env.RESEND_FROM_EMAIL ?? "").split("@")[1];
  const domain = data.find((d) => d.name === from);
  if (!from) return bad("Resend", "RESEND_FROM_EMAIL not set");
  if (!domain) return bad("Resend", `${from} is not a domain on this account — mail will be rejected`);
  if (domain.status !== "verified") {
    return bad("Resend", `${from} is ${domain.status} — DNS not verified, mail gets spam-filed`);
  }
  ok("Resend", `${from} verified`);
}

// --- Cron -------------------------------------------------------------------------------------

function checkCron() {
  const scheduled = JSON.parse(fs.readFileSync("vercel.json", "utf8")).crons.map((c) => c.path);
  const routes = fs
    .readdirSync("src/app/api/cron", { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => `/api/cron/${e.name}`);

  const missing = scheduled.filter((p) => !routes.includes(p));
  const unscheduled = routes.filter((p) => !scheduled.includes(p));

  if (missing.length) bad("vercel.json", `schedules routes that don't exist: ${missing.join(", ")}`);
  if (unscheduled.length) bad("vercel.json", `route never scheduled: ${unscheduled.join(", ")}`);
  if (!missing.length && !unscheduled.length) ok("Cron", `${routes.length} scheduled, all exist`);
}

// ----------------------------------------------------------------------------------------------

if (!env.CRON_SECRET) bad("CRON_SECRET", "not set — the reminder endpoint refuses every call");
else ok("CRON_SECRET", "set");

if (!env.TUTOR_TIMEZONE) skip("TUTOR_TIMEZONE", "unset — defaults to America/New_York");

checkCron();
await checkSupabase();
await checkStripe();
await checkGoogle();
await checkResend();

const icon = { ok: "PASS", bad: "FAIL", skip: "note" };
for (const r of results) console.log(`${icon[r.state].padEnd(5)} ${r.name.padEnd(28)} ${r.detail}`);

const failures = results.filter((r) => r.state === "bad").length;
console.log(
  failures === 0
    ? "\nReady to walk the flows."
    : `\n${failures} to fix before the walkthrough.`,
);
process.exit(failures > 0 ? 1 : 0);
