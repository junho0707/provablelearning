# Content Roadmap — Manual

Author your whole curriculum as a flat list of **nodes**. A node is either a **lesson** (a teachable
unit) or a **concept** (a container / organizing topic). Two *different* relationships tie them together:

- **parent** — a node lives *inside* a concept. This is the structural backbone. On the Map it's the
  solid tree; a concept branches into its children.
- **prereqs** — you must learn X *before* this node. True ordering only. On the Map it's a separate
  dashed gold arrow off to the side. **Never** use it to say "belongs to."

From that one file you get two views:

- **Map** — a top-down tree of concepts branching into their children, with dashed prereq links overlaid.
- **Order** — flattened into a do-this-next sequence: lessons numbered, concepts shown as ◇ markers.

---

## The fields on each node

```jsonc
{
  "id": "add-sub-diff-denom",                       // unique, kebab-case, stable
  "title": "Different Denominators",                // LOCAL name only — breadcrumb shows the rest
  "type": "lesson",                                 // "lesson" (default) or "concept"
  "number": "3.2",                                  // lessons only, manual, shown on the card
  "parent": "fraction-addition",                    // what this lives inside (structure)
  "prereqs": ["add-sub-same-denom"]                 // cross-branch must-learn-before only
}
```

- **`type`** — `lesson` for real content, `concept` for a container. Lessons omit `type`; only concepts
  carry `"type": "concept"`. Concepts show dashed/italic on the Map and unnumbered (◇) in the Order.
- **`title`** — just the **local** name (`Different Denominators`), not the full path. The card shows a
  breadcrumb of the ancestors (`Fractions › Arithmetic › Addition & Subtraction`) built from `parent`,
  so you never retype the group chain.
- **`number`** — lessons only, and you type it yourself (e.g. `3` or `3.2`). Shown as a gold badge on
  the card and a `#` chip in the Order. Concepts can't have one.
- **`parent`** — the id of the **concept** that *contains* this one. Concepts nest under concepts;
  a lesson's parent is always a concept ("elementary lesson under a concept"). **Lessons never parent
  lessons.** Root concepts have no parent.
- **`prereqs`** — other **lessons** this lesson depends on, drawn as dashed side-links. This is how you
  model an **application** (`GCF` depends on `Factors and Multiples`) *and* a cross-branch dependency
  (`Different Denominators` needs `Same Denominators`). Lesson→lesson is always a prereq, never a parent.
  Concepts don't have prereqs.
  - **Prereqs are transitive** — declare only the *direct* one. If `a → b` and `b → c`, then `a` is
    assumed a prerequisite of `c` (it's honoured in ordering, tracing, and layout). A redundant edge
    you declare anyway (`a → c`) is hidden on the Map. Prereqs also push a node *below* everything it
    depends on, so the dashed arrows always flow downward.

### Your fraction example, in the two-relationship model

```
Fractions                              (concept, root)
├─ Definition                          (lesson,  parent: fractions)
└─ Arithmetic                          (concept, parent: fractions)
   └─ Addition & Subtraction           (concept, parent: fractions-arithmetic)
      ├─ Same Denominator              (lesson,  parent: addition-subtraction)
      └─ Different Denominator         (lesson,  parent: addition-subtraction, prereqs: [same-denominator])
```

Solid branches = `parent`. The one dashed arrow = `Different Denominator` *needs* `Same Denominator`.

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
   - It slots into the tree under its parent and writes straight to `roadmap.json`.
4. Click any node (in Edit mode) to change or delete it. Deleting lifts its children to top-level and
   strips it from other nodes' prereqs.
5. Flip to **Order** anytime to see the linear path (parents and prereqs both respected).

**Reading the Map:** solid lines = *contains*, dashed gold = *prerequisite* (see the legend, bottom
right). Click a node (not in Edit mode) to trace its prerequisite chain — what it *needs* and what it
*unlocks*. Scroll to zoom, drag to pan.

**The validation bar** catches: unknown/self parent, a **parent loop**, unknown/self prereq, a
**prerequisite loop**, and duplicate ids.

---

## Notes

- Hand-edit `roadmap.json` in VS Code and hit **Reload** if you prefer — the file is the source of truth.
- Not on Chrome / no server? The editor downloads an updated `roadmap.json` only as a last resort.
- File shape: `{ "meta": { "title": "…" }, "nodes": [ … ] }`.
