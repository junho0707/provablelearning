import type { ReactElement } from "react";
import { evaluate } from "@mdx-js/mdx";
import * as runtime from "react/jsx-runtime";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

/**
 * Compile a lesson's MDX body to a React element, server-side. `remark-math` parses `$…$` / `$$…$$`
 * and `rehype-katex` renders the math to static HTML+CSS at render time — so the math is present in
 * the initial server HTML with no client JS (NFR-PERF-001, AT-CONTENT-001). KaTeX styling comes from
 * `katex/dist/katex.min.css`, imported by the lesson page.
 */
export async function renderMdx(body: string): Promise<ReactElement> {
  const { default: Content } = await evaluate(body, {
    ...runtime,
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex],
  });
  return <Content />;
}
