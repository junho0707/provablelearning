# Content Roadmap — Manual

Author your whole curriculum as a flat list of **nodes**. A node is either a **lesson** (a teachable
unit) or a **concept** (a container / organizing topic). Two *different* relationships tie them together:

- **parent** — a node lives *inside* a concept. This is the structural backbone. On the Map a concept
  is a **box that literally contains** its children — nesting *is* containment, no line needed.
- **prereqs** — you must learn X *before* this node. True ordering only. On the Map it's the *only*
  line: a dashed gold arrow. **Never** use it to say "belongs to."

From that one file you get two views:

- **Map** — nested boxes: each concept is a container holding its lessons (and sub-concept boxes), with
  dashed gold prereq arrows drawn on top. Containment = nesting; dependency = arrows. The two read apart.
- **Order** — the lessons flattened into a do-this-next sequence, numbered by their `number` field.

---

## The fields on each node

```jsonc
{
  "id": "add-sub-diff-denom",                       // unique, kebab-case, stable
  "title": "Different Denominators",                // LOCAL name only — breadcrumb shows the rest
  "type": "lesson",                                 // "lesson" (default) or "concept"
  "number": "3.2",                                  // lessons only, manual, shown on the card
  "role": "application",                            // lessons only: "core" (default) or "application"
  "parent": "fraction-addition",                    // what this lives inside (structure)
  "prereqs": ["add-sub-same-denom"]                 // cross-branch must-learn-before only
}
```

- **`type`** — `lesson` for real content, `concept` for a container. Lessons omit `type`; only concepts
  carry `"type": "concept"`. Concepts render as ◇ container boxes on the Map and are dropped from the Order.
- **`title`** — just the **local** name (`Different Denominators`), not the full path. The card shows a
  breadcrumb of the ancestors (`Fractions › Arithmetic › Addition & Subtraction`) built from `parent`,
  so you never retype the group chain.
- **`number`** — lessons only, and you type it yourself (e.g. `3` or `3.2`). Shown as a gold badge on
  the card and the number in the Order. Concepts can't have one.
- **`role`** — lessons only. A lesson's *function inside its concept*: **`core`** (default) teaches the
  concept itself; **`application`** applies or extends it (usually by combining earlier lessons). On the
  Map, applications render as a subordinate tier — warm tint, `▸ Applies` pill — so a concept's core and
  what builds on it read apart at a glance. This is a **manual, pedagogical** call, *not* derivable from
  `prereqs`: e.g. GCF *applies* Factors even though both live in the same branch. It's an independent
  axis from `parent` (which container) and `prereqs` (which exact lessons come first).
- **`parent`** — the id of the **concept** that *contains* this one. Concepts nest under concepts;
  a lesson's parent is always a concept ("elementary lesson under a concept"). **Lessons never parent
  lessons.** Root concepts have no parent. `parent` may also be an **array of ids** — a *bridge* node
  that belongs to two branches at once (see *Cross-tree lessons* below).
- **`prereqs`** — other **lessons** this lesson depends on, drawn as dashed side-links. This is how you
  model an **application** (`GCF` depends on `Factors and Multiples`) *and* a cross-branch dependency
  (`Different Denominators` needs `Same Denominators`). Lesson→lesson is always a prereq, never a parent.
  Concepts don't have prereqs.
  - **Prereqs are transitive** — declare only the *direct* one. If `a → b` and `b → c`, then `a` is
    assumed a prerequisite of `c` (it's honoured in ordering, tracing, and layout). A redundant edge
    you declare anyway (`a → c`) is hidden on the Map. Prereqs also push a node *below* everything it
    depends on, so the dashed arrows always flow downward.
  - **Cross-tree nodes (bridges)** — a node that belongs to two branches at once (e.g. a *Mixed
    Operations* concept between Fractions and Decimals) gets an **array** `parent`, e.g.
    `"parent": ["fractions", "decimals"]`. It can't *nest* inside two boxes, so on the Map it renders as
    a **bridge**: a box floating *between* its parents with a **solid containment line** up to each. In
    the editor, tick 2+ concepts in the Parent list. (Its own lessons/prereqs work as normal — e.g.
    *Mixed Add/Sub* lives inside the bridge and takes prereqs from both the fractions and decimals side.)

### Your fraction example, in the two-relationship model

```
Fractions                              (concept, root)
├─ Definition                          (lesson,  parent: fractions)
└─ Arithmetic                          (concept, parent: fractions)
   └─ Addition & Subtraction           (concept, parent: fractions-arithmetic)
      ├─ Same Denominator              (lesson,  parent: addition-subtraction)
      └─ Different Denominator         (lesson,  parent: addition-subtraction, prereqs: [same-denominator])
```

Nested boxes = `parent` (Definition and the Arithmetic box sit *inside* the Fractions box). The one
dashed arrow = `Different Denominator` *needs* `Same Denominator`.

---

## The main flow

1. **Start the viewer** (Chrome/Edge so it can save your file):
   ```
   cd roadmap
   python3 -m http.server 8000
   ```
   Open **http://localhost:8000/viewer.html**.
2. **Connect file** → pick `roadmap.json`, allow editing (one time).
3. Walk your table of contents. For each entry:
   - **✎ Edit** → **＋ Add node**
   - Pick **Type**, fill **id · title**, choose a **Parent** (the concept it lives in), and tick any
     **Prerequisites** (only real must-come-first nodes) → **Save**.
   - It slots *inside* its parent's box and writes straight to `roadmap.json`.
4. Click any node (in Edit mode) to change or delete it. Deleting lifts its children to top-level and
   strips it from other nodes' prereqs.
5. Flip to **Order** anytime to see the linear path (parents and prereqs both respected).

**Reading the Map:** nesting = *contains* (a lesson inside a concept box), dashed gold arrow =
*prerequisite* (see the legend, bottom right). Inside a box the lessons form a small **dependency tree** —
a lesson sits below the box-mates it needs, with the arrows flowing down. Click a card (not in Edit mode)
to trace its prerequisite chain — what it *needs* and what it *unlocks*. Scroll to zoom, drag to pan.

**☰ Lessons panel** (top-right toggle, Map view): a left-docked housekeeping list of every lesson in
number order, each showing its tags — number (or a red **no #**), **core / application**, strand (colour
+ name), container breadcrumb, and prereqs — plus an **orphan** flag for any lesson with no parent. Click
a row to trace it on the Map, or to edit it when in Edit mode.

**The validation bar** catches: unknown/self parent, a **parent loop**, unknown/self prereq, a
**prerequisite loop**, and duplicate ids.

---

## Notes

- Hand-edit `roadmap.json` in VS Code and hit **Reload** if you prefer — the file is the source of truth.
- Not on Chrome / no server? The editor downloads an updated `roadmap.json` only as a last resort.
- File shape: `{ "meta": { "title": "…" }, "nodes": [ … ] }`.
