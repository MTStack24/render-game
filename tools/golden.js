/* Golden behavior baseline for Acts 1-2.
   Runs deterministic pseudo-random input scripts (moves, waits, undos)
   through every shipped level and hashes the event streams + end states.
   Usage:  node tools/golden.js --save    (capture baseline)
           node tools/golden.js --check   (compare against baseline)
   The point: Act 3 engine surgery must not change one byte of Act 1-2
   behavior. Undo semantics for levels without a warden must be identical. */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { Game } = require("./build/engine.js");
const { LEVELS } = require("./build/levels.js");

const BASE = path.join(__dirname, "golden-base.json");
const GOLDEN_COUNT = 15; // L1..L15 only; act 3 levels are covered by witnesses

function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function snapshot(g) {
  return {
    player: g.player && {
      x: g.player.x,
      y: g.player.y,
      size: g.player.size,
      meat: g.player.meat,
      alive: g.player.alive,
      exited: !!g.player.exited,
    },
    blocks: g.blocks
      .map((b) => ({
        kind: b.kind,
        x: b.x,
        y: b.y,
        mine: !!b.mine,
        src: b.src,
      }))
      .sort((a, b) => a.x - b.x || a.y - b.y || a.kind.localeCompare(b.kind)),
    hunter: g.hunter
      ? { x: g.hunter.x, y: g.hunter.y, alive: g.hunter.alive }
      : null,
    blood: Array.from(g.blood).sort((a, b) => a - b),
    quota: { need: g.quota.need, have: g.quota.have },
    sources: { ...g.sources },
    moves: g.moves,
    over: g.over
      ? {
          win: !!g.over.win,
          lose: !!g.over.lose,
          reason: g.over.reason || null,
        }
      : null,
  };
}

function runScript(def, seed, steps) {
  const g = new Game(def);
  const rnd = lcg(seed);
  const log = [];
  for (let k = 0; k < steps; k++) {
    const r = rnd();
    if (r < 0.13) {
      const res = g.undo();
      const ok = res === true || (res && res.ok); // tolerate old bool / new {ok} shape
      log.push("Z" + (ok ? "+" : "-"));
      continue;
    }
    const pool = "UDLRW"; // W is a no-op in act 1; legal wait in act 2
    const key = pool[Math.floor(rnd() * pool.length)];
    const ev = g.input(key);
    log.push(key + ":" + (ev ? ev.map((e) => e.t).join(",") : "-"));
  }
  log.push("END:" + JSON.stringify(snapshot(g)));
  return log;
}

function capture() {
  const out = {};
  LEVELS.slice(0, GOLDEN_COUNT).forEach((def, i) => {
    const logs = [];
    for (let v = 0; v < 6; v++)
      logs.push(runScript(def, 7919 * (i + 1) + v * 104729, 90));
    out[def.id] = crypto
      .createHash("sha256")
      .update(JSON.stringify(logs))
      .digest("hex");
  });
  return out;
}

const mode = process.argv[2];
const now = capture();
if (mode === "--save") {
  fs.writeFileSync(BASE, JSON.stringify(now, null, 2));
  console.log("golden baseline saved:", Object.keys(now).length, "levels");
} else if (mode === "--check") {
  const base = JSON.parse(fs.readFileSync(BASE, "utf8"));
  let bad = 0;
  for (const id of Object.keys(base)) {
    if (now[id] !== base[id]) {
      bad++;
      console.error("MISMATCH", id);
    }
  }
  if (bad) {
    console.error("golden check FAILED:", bad, "level(s) diverged");
    process.exit(1);
  }
  console.log("golden check OK:", Object.keys(base).length, "levels identical");
} else {
  console.error("usage: node tools/golden.js --save | --check");
  process.exit(2);
}
