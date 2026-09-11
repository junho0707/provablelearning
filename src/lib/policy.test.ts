import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BOOKING_HORIZON_MS,
  CREDIT_RETURNS_PER_MONTH,
  FREE_CANCEL_MS,
  MATERIALS_DUE_HOURS,
  MIN_NOTICE_MS,
  NO_SHOW_AFTER_MINUTES,
  RELEASED_SLOT_MIN_NOTICE_MS,
  RELEASE_WEEKDAY,
  RETENTION_DAYS,
  SESSION_MINUTES,
} from "./policy";

/**
 * The doc is the specification; this module is its executable form. Reading the doc's text here
 * means a policy change made in only one of the two places fails CI, which is the whole point of
 * having a single constants module (`system/README.md`, update rules).
 */
const POLICIES = readFileSync(join(process.cwd(), "system/02-POLICIES.md"), "utf8");

describe("policy constants match system/02-POLICIES.md", () => {
  it("session length is 60 minutes", () => {
    expect(SESSION_MINUTES).toBe(60);
    expect(POLICIES).toContain("**60-minute**");
  });

  it("minimum notice is 2 hours, and equals the free-cancellation window", () => {
    expect(MIN_NOTICE_MS).toBe(2 * 60 * 60 * 1000);
    expect(FREE_CANCEL_MS).toBe(MIN_NOTICE_MS);
    expect(POLICIES).toContain("**Minimum notice: 2 hours.**");
    expect(POLICIES).toContain("**≥2 hours before**");
  });

  it("a released slot stays bookable until 1 hour before", () => {
    expect(RELEASED_SLOT_MIN_NOTICE_MS).toBe(60 * 60 * 1000);
    expect(POLICIES).toContain("**until 1 hour before**");
  });

  it("horizon is 4 weeks and releases on Monday", () => {
    expect(BOOKING_HORIZON_MS).toBe(28 * 24 * 60 * 60 * 1000);
    expect(RELEASE_WEEKDAY).toBe(1);
    expect(POLICIES).toContain("**Availability horizon: 4 weeks.**");
    expect(POLICIES).toContain("**Monday**");
  });

  it("no-show is 15 minutes", () => {
    expect(NO_SHOW_AFTER_MINUTES).toBe(15);
    expect(POLICIES).toContain("**cancelled at the 15-minute mark**");
  });

  it("credit returns are capped at 2 per calendar month", () => {
    expect(CREDIT_RETURNS_PER_MONTH).toBe(2);
    expect(POLICIES).toContain("**Cap: 2 per calendar month, per student, combined**");
  });

  it("materials are due within 24 hours", () => {
    expect(MATERIALS_DUE_HOURS).toBe(24);
    expect(POLICIES).toContain("**Delivered within 24 hours**");
  });

  it("retention is 30 days", () => {
    expect(RETENTION_DAYS).toBe(30);
  });
});
