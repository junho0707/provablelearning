/**
 * The class strings the signed-in surfaces share with the landing page.
 *
 * The landing is built from hard-edged panels butted together: no radius, no shadow, an off-white
 * ground, and hairlines at `navy-950/10` doing all the dividing. The signed-in pages were built
 * earlier, from rounded cards floating on a grey grid, and read as a different product once you
 * crossed the sign-in. These constants are that language written down once, so the two halves
 * cannot drift apart again — four separate copies of an `inputClass` had already diverged.
 *
 * Strings, not components: every call site keeps its own markup and semantics, and only borrows
 * the look. Anything used in one place stays inline at that place.
 */

/** The page ground, shared with the landing's light panels. Not a Tailwind colour — one literal. */
export const GROUND = "#faf9f7";

/** The only divider. Every rule, cell border and input outline is this weight of navy. */
export const RULE = "border-navy-950/10";

/**
 * Page headline. Clamped like the landing's, and `font-semibold` rather than the `font-extrabold`
 * the app pages used — at these sizes the heavier weight reads as a different typeface.
 */
export const H1 =
  "text-[clamp(1.875rem,3.5vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.025em] text-navy-950";

/** Section heading inside a page. */
export const H2 = "text-[1.375rem] font-semibold tracking-[-0.02em] text-navy-950";

/** Sub-heading inside a section — the size the landing gives the cells of its grids. */
export const H3 = "text-lg font-semibold tracking-[-0.01em] text-navy-950";

/**
 * Small, wide-tracked label above a group. Never a heading and never sized up to stand in for one
 * — the landing's rule, kept here so the two pages' kickers match.
 */
export const EYEBROW = "text-[0.6875rem] font-semibold uppercase tracking-[0.22em] text-navy-950/45";

/** The standing body size across both halves of the site. */
export const BODY = "text-[0.9375rem] leading-relaxed text-navy-700";

/** A form field's label. */
export const LABEL = "text-[0.8125rem] font-semibold text-navy-950";

/** Text inputs, textareas and selects. Square, hairline, and the border darkens on focus. */
export const INPUT =
  "w-full border border-navy-950/15 bg-white px-3 py-2.5 text-[0.9375rem] text-navy-950 outline-none placeholder:text-navy-950/35 focus:border-navy-950";

/** The primary action: solid navy, square, no radius. */
export const BTN =
  "inline-block bg-navy-950 px-5 py-2.5 text-[0.875rem] font-semibold text-white hover:bg-navy-800 disabled:opacity-40";

/** The same action at the size the landing gives its panel CTAs. */
export const BTN_LG =
  "inline-block bg-navy-950 px-7 py-3.5 text-[0.9375rem] font-semibold text-white hover:bg-navy-800 disabled:opacity-40";

/** A secondary action, or a toggle in its unselected state. */
export const BTN_SECONDARY =
  "inline-block border border-navy-950/15 bg-white px-5 py-2.5 text-[0.875rem] font-semibold text-navy-950 hover:border-navy-950 disabled:opacity-40";

/** An action with no box at all, for the several that sit in a row beside a heading. */
export const BTN_QUIET =
  "text-[0.875rem] font-semibold text-navy-600 hover:text-navy-950 disabled:opacity-40";

/** Gold, for buying — the one moment the landing spends its accent on a button. */
export const BTN_GOLD =
  "inline-block bg-gold-500 px-7 py-3.5 text-[0.9375rem] font-semibold text-navy-950 hover:bg-gold-400 disabled:opacity-40";

/** An aside the reader should notice but not act on: hairline-boxed, never tinted. */
export const NOTICE = "border border-navy-950/10 bg-white px-4 py-3 text-[0.875rem] text-navy-800";

/** The same, when what it says is that something has been paid for or is waiting. */
export const NOTICE_GOLD =
  "border-l-2 border-gold-500 bg-gold-100 px-4 py-3 text-[0.875rem] text-navy-800";

/** An error the reader must act on. `role="alert"` belongs at the call site, not in the class. */
export const NOTICE_ERROR =
  "border-l-2 border-[var(--error)] bg-[var(--error-light)] px-4 py-3 text-[0.875rem] text-[var(--error)]";

/** Confirmation that something saved. */
export const NOTICE_OK =
  "border-l-2 border-[var(--success)] bg-[var(--success-light)] px-4 py-3 text-[0.875rem] text-[var(--success)]";
