/**
 * One-off: mint a Calendar-scoped refresh token for the **production** OAuth client.
 *
 * `node scripts/google-refresh-token.mjs`
 *
 * Supabase's Google sign-in uses the same client but only ever asks for identity scopes, so it
 * never yields a token that can create Calendar events. This runs the consent flow directly,
 * asking for `calendar` and `access_type: offline`, which is the only way a refresh token comes
 * back. Reads the client from `.env.production` on purpose — prod's client id differs from the
 * one in `.env.local`, and a refresh token is bound to the client that issued it.
 *
 * Register `http://localhost:53682/oauth2callback` as a redirect URI on that client first. Port
 * 53682 rather than 3000 so this does not fight the dev server.
 *
 * Sign in as the account that owns `GOOGLE_BOOKING_CALENDAR_ID` — events land wherever you sign in.
 */
import http from "node:http";
import fs from "node:fs";
import { google } from "googleapis";

const REDIRECT = "http://localhost:53682/oauth2callback";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.production", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

for (const key of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]) {
  if (!env[key]) {
    console.error(`Missing ${key} in .env.production`);
    process.exit(1);
  }
}

const oauth2 = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, REDIRECT);

const url = oauth2.generateAuthUrl({
  access_type: "offline",
  // Without this, Google returns no refresh token at all on a repeat consent.
  prompt: "consent",
  scope: ["https://www.googleapis.com/auth/calendar"],
});

console.log(`\nClient: ${env.GOOGLE_CLIENT_ID.slice(0, 20)}…\n`);
console.log("Open this URL, and sign in as the booking calendar's owner:\n");
console.log(url + "\n");

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, REDIRECT);
  if (!u.pathname.startsWith("/oauth2callback")) {
    res.writeHead(404).end();
    return;
  }
  const error = u.searchParams.get("error");
  if (error) {
    res.end(`Consent refused: ${error}`);
    console.error(`\nConsent refused: ${error}`);
    server.close();
    process.exit(1);
  }
  try {
    const { tokens } = await oauth2.getToken(u.searchParams.get("code"));
    res.end("Token received. Return to the terminal.");
    if (!tokens.refresh_token) {
      console.error("\nNo refresh token returned — revoke this app's access and run again.");
      process.exit(1);
    }
    console.log("\nPaste this into Vercel as GOOGLE_REFRESH_TOKEN (Production):\n");
    console.log(tokens.refresh_token + "\n");
  } catch (e) {
    res.end("Exchange failed.");
    console.error("\nExchange failed:", e.message);
  }
  server.close();
  process.exit(0);
});

server.listen(53682, () => console.log("Waiting on http://localhost:53682 …\n"));
