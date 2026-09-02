import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SkillTree } from "./skill-tree";
import { layoutTree } from "@/lib/content/layout";
import { getTree } from "@/lib/content/catalog";

/**
 * The map's rules are as much about what is *not* interactive as what is. These assert the markup
 * a keyboard and a screen reader actually meet: cards are buttons, groups are scenery.
 */

const markup = () => renderToStaticMarkup(<SkillTree layout={layoutTree(getTree())} />);

describe("SkillTree accessibility", () => {
  it("makes every card a labelled button and every group inert", () => {
    const layout = layoutTree(getTree());
    const html = markup();

    const buttons = html.match(/role="button"/g) ?? [];
    const cards = layout.nodes.filter((n) => !n.isContainer);
    expect(buttons).toHaveLength(cards.length);

    // Groups carry no role, no tab stop, and no pointer target.
    const inert = html.match(/pointer-events-none/g) ?? [];
    expect(inert.length).toBeGreaterThanOrEqual(
      layout.nodes.filter((n) => n.isContainer).length,
    );
  });

  it("spells out a card's place in the hierarchy, which nesting only shows visually", () => {
    expect(markup()).toContain(
      'aria-label="Math, Numbers, Rationals, Fractions, Fractions - Definition, lesson 6"',
    );
  });

  it("tells the user how to drive the canvas and gives it a tab stop", () => {
    const html = markup();
    expect(html).toMatch(/tabindex="0"[^>]*role="group"|role="group"[^>]*tabindex="0"/);
    expect(html).toMatch(/aria-label="Math curriculum map\. Scroll to zoom[^"]*"/);
  });

  it("groups the overlay choices as a named radio set", () => {
    const html = markup();
    expect(html).toContain("<fieldset");
    expect((html.match(/name="roadmap-overlay"/g) ?? []).length).toBe(3);
    expect(html).toContain("prerequisites");
  });

  it("labels the zoom controls and hides their icons from assistive tech", () => {
    const html = markup();
    for (const label of ["Zoom in", "Zoom out", "Reset view", "Full screen"]) {
      expect(html).toContain(`aria-label="${label}"`);
    }
    expect(html).toContain('<span aria-hidden="true">+</span>');
  });
});
