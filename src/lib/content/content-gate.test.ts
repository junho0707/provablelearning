import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";

/**
 * `AT-CONTENT-1/2/3`. Content is **not public at launch** (`system/00-BUSINESS.md` §1, ADR-007) —
 * the pipeline and the authored lessons stay in the repo, but nothing serves them.
 *
 * This replaces the old guard, which asserted the opposite (that no content route required an
 * account, back when free public content was the acquisition channel). The decision reversed, so
 * the test that protects it had to reverse too: what needs guarding now is that a content route
 * does not quietly reappear, since the catalog still exists and is easy to re-route by accident.
 */

const root = process.cwd();

function routeExists(...segments: string[]): boolean {
  return fs.existsSync(path.join(root, "src/app", ...segments));
}

describe("AT-CONTENT-1: no public route serves content", () => {
  it("has no /courses route", () => {
    expect(routeExists("(content)", "courses")).toBe(false);
    expect(routeExists("courses")).toBe(false);
  });

  it("has no /roadmap route", () => {
    expect(routeExists("roadmap")).toBe(false);
  });

  it("has no worksheet route", () => {
    expect(routeExists("(content)")).toBe(false);
  });
});

describe("AT-CONTENT-2: crawlers are not pointed at content", () => {
  it("the sitemap lists no lesson or roadmap URL", () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls.some((u) => u.includes("/courses"))).toBe(false);
    expect(urls.some((u) => u.includes("/roadmap"))).toBe(false);
  });

  it("the sitemap still lists the marketing and legal pages", () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls.some((u) => u.endsWith("/"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/privacy"))).toBe(true);
  });

  it("robots disallows the signed-in surfaces", () => {
    const rules = robots().rules;
    const disallow = Array.isArray(rules) ? [] : ((rules.disallow ?? []) as string[]);
    expect(disallow).toContain("/student");
    expect(disallow).toContain("/admin");
  });
});

describe("AT-CONTENT-3: navigation offers no path into content", () => {
  it("the site nav has no content tabs", () => {
    const nav = fs.readFileSync(path.join(root, "src/components/site-nav-client.tsx"), "utf8");
    expect(nav).not.toMatch(/href: "\/roadmap"/);
    expect(nav).not.toMatch(/href: "\/courses"/);
  });
});
