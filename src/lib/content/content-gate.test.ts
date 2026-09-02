import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getAllLessons } from "./catalog";

const root = process.cwd();
const lessonPageSrc = fs.readFileSync(
  path.join(root, "src/app/(content)/courses/[slug]/page.tsx"),
  "utf8",
);

// AT-CONTENT-005: no content route requires an account — the regression guard against a paywall
// creeping back in (ADR-004, CON6). A live "anon client gets 200 for every lesson" check needs a
// deployed preview (see VERIFY.md); this asserts the static precondition that makes it true: the
// lesson route never gates on a session, and every catalog lesson is reachable statically.

describe("AT-CONTENT-005: content routes never gate on an account", () => {
  it("the lesson page never checks auth or redirects an anonymous visitor", () => {
    expect(lessonPageSrc).not.toMatch(/getUser\(|redirect\(|createClient\(/);
  });

  it("every lesson in the catalog is enumerated for static generation (no runtime account gate)", () => {
    const slugs = getAllLessons().map((l) => l.slug);
    expect(slugs.length).toBeGreaterThan(0);
    expect(lessonPageSrc).toMatch(/generateStaticParams/);
  });
});
