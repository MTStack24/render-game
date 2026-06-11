/* Extracts the engine and level script blocks out of render.html into
   tools/build/ so they can be required from Node (both blocks carry
   module.exports guards). Run before any solver/golden work. */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "render.html"), "utf8");
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
  (m) => m[1],
);

const engine = blocks.find((b) => b.includes("RENDER — core engine"));
const levels = blocks.find((b) => b.includes("RENDER — chambers"));
if (!engine || !levels)
  throw new Error("could not locate engine/levels script blocks");

fs.mkdirSync(path.join(__dirname, "build"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "build", "engine.js"), engine);
fs.writeFileSync(path.join(__dirname, "build", "levels.js"), levels);
console.log(
  "extracted engine.js (%d b) levels.js (%d b)",
  engine.length,
  levels.length,
);
