// Scaffold a stub MDX file for every lesson node in roadmap/roadmap.json that doesn't have one yet.
// Run after adding lesson nodes to the map:  node scripts/scaffold-content.mjs
// Existing files are never touched. Stubs render as "coming soon" until you replace the TODO body.

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const roadmap = JSON.parse(fs.readFileSync(path.join(root, "roadmap", "roadmap.json"), "utf8"));
const contentDir = path.join(root, "content");
fs.mkdirSync(contentDir, { recursive: true });

const lessons = roadmap.nodes.filter((n) => n.number != null);
let created = 0;

for (const n of lessons) {
  const file = path.join(contentDir, `${n.id}.mdx`);
  if (fs.existsSync(file)) continue;
  fs.writeFileSync(file, `{/* TODO: write this lesson — "${n.title}" (#${n.number}) */}\n`);
  console.log("created content/" + `${n.id}.mdx`);
  created++;
}

console.log(`\n${created} stub(s) created · ${lessons.length} lesson nodes in the map.`);
