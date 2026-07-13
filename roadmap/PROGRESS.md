# Roadmap tool — progress / handoff

_Last worked: 2026-07-12._

The **roadmap viewer** (`roadmap/viewer.html` + `roadmap/roadmap.json`) is a standalone,
hand-authored curriculum map. Author the whole curriculum as a flat list of **nodes** in
`roadmap.json`; the viewer renders a **Map** and an **Order**. Full manual: `roadmap/README.md`.

## ⚠️ Before doing anything: eyeball the render
A large amount of visual work this session was **never rendered** — there's no browser in the
agent environment. JSON, JS syntax, and wiring are verified; **the look is not.** So first:

```
cd roadmap && python3 -m http.server 8000   →   http://localhost:8000/viewer.html
```

Confirm: boxes render · chips readable · ☰ Lessons panel opens · the **Mixed Operations bridge**
lands sensibly between Fractions & Decimals with a solid line into each. If anything's broken,
that's the first fix.

## The model (settled)
Each node is a **lesson** or a **concept** (container). Fields:
- **`parent`** — container. A **string** (single home, nests) OR an **array** (a *bridge* node
  belonging to 2 branches, e.g. `["fractions","decimals"]`).
- **`number`** — lessons only; drives the **Order** (numeric sort).
- **`role`** — `core` (default) or `application` (applies/extends its concept).
- **`strand`** — colour group; shown as the concept box's tinted header band.
- **`prereqs`** — lesson→lesson dependencies (dashed gold arrows). Keep only **non-trivial** ones
  (don't wire every lesson back to definitions; ordering is from `number`).

## What the viewer shows
- **Map** — concepts are **nested boxes** (nesting = containment, no parent lines). Strand colour =
  **header band**. Lessons = compact **chips** (number badge + title; gold **dot** = application;
  faint warm tint). Inside a box, lessons stack into **dependency-depth rows** (a mini tree).
  Prereqs = dashed gold arrows. **Bridges** (multi-parent) float between parents with **solid grey
  containment lines**. `① Show order` overlays the 1→N path.
- **Order** — lessons only, sorted by `number`, concept containers dropped.
- **☰ Lessons panel** (top-right toggle, left dock) — every lesson in number order with its tags
  (number / `no #`, core|application, strand swatch+name, breadcrumb, needs), plus an **orphan**
  flag. Click a row → trace on Map (or edit in Edit mode).

## Editor (✎ Edit → ＋ Add node)
Supports type, id, title, number, **role**, **parent (multi-checkbox — tick 2+ for a bridge)**,
strand, prereqs. Saves straight to `roadmap.json` (Chrome/Edge, "Connect file" once).

## Done this session
1. **Order** sorts by `number` (was a topo sort that scrambled the numbers).
2. Added **`role`** (core/application) + tiering.
3. Map rewritten to **nested containers**; then lessons-as-dependency-tree inside boxes.
4. Density pass: **lighter chips + more air**; removed card/box **left strips**; strand colour →
   **header band**.
5. **☰ Lessons** housekeeping side panel.
6. **Multi-parent (bridge) nodes** — `parent` as array, floating render + solid lines, editor
   multi-select, validation + README updated. Added **Mixed Operations** bridge + `#16 Mixed Add/Sub`.
7. **Pruned trivial/redundant prereqs** (dropped every `definition→…` edge + redundant GCF/LCM on #8).

## Open / next (nothing blocking authoring)
- **Verify the render** (see top) — biggest risk is **bridge placement** (`BR_GAP` / centering in
  `renderMap` are quick dials if it sits wrong).
- **Not built (floated earlier):** `validate()` checks for a parentless lesson and for a `number`
  order that contradicts a prereq; density levers *hover-focus edges* and *collapsible concepts*.
- **Minor:** bridge parent-cycle detection only follows the first parent.

## Ready to input?
Yes — the model + editor are complete. Just render-check once first, then author via the editor
(or hand-edit `roadmap.json` and Reload).
