/* RENDER act-3 solver / verifier.
   Plain position-BFS stops working once Z (undo) is a legal input, because
   the value of a state depends on the undo history beneath it. Soundness
   trick: with B undos
   of budget remaining you can never observe more than the top B history
   entries, so the search state is (core state, undos left, top-B history
   keys) and that IS finitely memoizable.

   Commands:
     node tools/solve.js lint            lint act-3 chamber defs
     node tools/solve.js noz  <id>       prove the chamber unsolvable without Z
     node tools/solve.js solve <id>      find a witness (Z legal), shortest first
     node tools/solve.js tight <id>      check budget-1 makes it unsolvable
     node tools/solve.js play <id> <str> ascii playback of an input string
     node tools/solve.js all             lint + solve + noz + tight for all
*/
"use strict";
const fs = require("fs");
const path = require("path");
const { Game } = require("./build/engine.js");
const { LEVELS } = require("./build/levels.js");

/* design-time chamber defs override shipped ones by id */
let DRAFT = [];
const draftPath = path.join(__dirname, "act3.js");
if (fs.existsSync(draftPath)) DRAFT = require(draftPath).LEVELS;

function defById(id) {
  return DRAFT.find((l) => l.id === id) || LEVELS.find((l) => l.id === id);
}
function act3Defs() {
  const ids = new Set();
  const out = [];
  for (const l of [...DRAFT, ...LEVELS]) {
    if (l.act === 3 && !ids.has(l.id)) {
      ids.add(l.id);
      out.push(l);
    }
  }
  return out;
}

/* ---------------- lint ---------------- */
const MASS = { meat: 2, twitch: 2, fleer: 2, half: 1 };
function lint(def) {
  const errs = [];
  const rows = def.map;
  const w = Math.max(...rows.map((r) => r.length));
  if (rows.some((r) => r.length !== w))
    errs.push("ragged rows (pad with # or space)");
  const metaEnts = (def.meta && def.meta.entities) || [];
  const count = (ch) =>
    rows
      .join("")
      .split("")
      .filter((c) => c === ch).length +
    metaEnts.filter((e) => e.t === ch).length;
  if (count("P") !== 1) errs.push("need exactly one P");
  if (def.act === 3 && count("K") !== 1) errs.push("act 3 needs exactly one K");
  if (def.quota > 0 && count("G") === 0) errs.push("quota but no grinder");
  if (def.undos === undefined && def.act === 3)
    errs.push("act 3 chamber without undo budget");
  let mass = 0;
  for (const c of rows.join("") + metaEnts.map((e) => e.t).join("")) {
    if (c === "M" || c === "W" || c === "F" || c === "U") mass += 2;
    if (c === "m") mass += 1;
  }
  if ((def.quota || 0) > mass)
    errs.push(`quota ${def.quota} exceeds available mass ${mass}`);
  // border closed: edge tiles must be # / space / D
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < w; x++) {
      if (y === 0 || y === rows.length - 1 || x === 0 || x === w - 1) {
        const c = x < rows[y].length ? rows[y][x] : " ";
        if (!(c === "#" || c === " " || c === "D"))
          errs.push(`open border at ${x},${y} ('${c}')`);
      }
    }
  }
  return errs;
}

/* ---------------- witness replay (strict) ---------------- */
function replayWitness(def, witness) {
  const g = new Game(def);
  let z = 0;
  for (let i = 0; i < witness.length; i++) {
    const ch = witness[i];
    if (ch === "Z") {
      const r = g.undo();
      if (!r.ok)
        return { ok: false, reason: `Z denied (${r.why}) at input ${i}` };
      z++;
      if (g.over)
        return {
          ok: false,
          reason: `died during Z at input ${i}: ${g.over.reason}`,
        };
    } else {
      const ev = g.input(ch);
      if (!ev) return { ok: false, reason: `no-op input '${ch}' at ${i}` };
      if (g.over && !g.over.win && i < witness.length - 1)
        return { ok: false, reason: `died at input ${i}: ${g.over.reason}` };
    }
  }
  if (!g.over || !g.over.win) return { ok: false, reason: "did not exit" };
  return { ok: true, moves: g.moves, zUsed: z, undoMax: g.undoMax };
}

/* ---------------- no-Z BFS: prove undo is required ---------------- */
function bfsNoZ(def, opts = {}) {
  const maxStates = opts.maxStates || 2_000_000;
  const inputs =
    def.act >= 2 ? ["U", "D", "L", "R", "W"] : ["U", "D", "L", "R"];
  const g = new Game(def);
  const seen = new Map(); // key -> {parentKey, input}
  const q = [g.exportState()];
  const rootKey = g.hashKey();
  seen.set(rootKey, null);
  const keys = [rootKey];
  let qi = 0;
  while (qi < q.length) {
    const snap = q[qi];
    const key = keys[qi];
    qi++;
    for (const k of inputs) {
      g.importState(snap);
      g.over = null;
      g.hist = []; // BFS never undoes; keep snapshots from piling up
      const ev = g.input(k);
      if (!ev) continue;
      if (g.over) {
        if (g.over.win) {
          // reconstruct
          let path = k,
            cur = key;
          while (seen.get(cur)) {
            path = seen.get(cur).input + path;
            cur = seen.get(cur).parentKey;
          }
          return { solved: path, exhausted: false, states: seen.size };
        }
        continue; // dead end without Z
      }
      const nk = g.hashKey();
      if (seen.has(nk)) continue;
      seen.set(nk, { parentKey: key, input: k });
      if (seen.size > maxStates)
        return { solved: null, exhausted: false, states: seen.size };
      q.push(g.exportState());
      keys.push(nk);
    }
  }
  return { solved: null, exhausted: true, states: seen.size };
}

/* ---------------- full search with Z as a legal input ---------------- */
function coreKey(g) {
  return g.hashKey() + "|o" + (g.over ? (g.over.win ? "W" : "L") : "-");
}
function searchWithZ(def, opts = {}) {
  const maxNodes = opts.maxNodes || 600_000;
  const maxDepth = opts.maxDepth || 64;
  const budgetOverride = opts.budget;
  const moveInputs =
    def.act >= 2 ? ["U", "D", "L", "R", "W"] : ["U", "D", "L", "R"];
  const g = new Game(def);
  if (budgetOverride !== undefined) {
    g.undoMax = budgetOverride;
    g.undoLeft = budgetOverride;
  }
  const B0 = g.undoLeft;

  // node: { snap, ckey, uLeft, hist (cons list {snap, ckey, next}), parent, input, depth }
  const root = {
    snap: g.exportState(),
    ckey: coreKey(g),
    uLeft: B0,
    hist: null,
    parent: null,
    input: null,
    depth: 0,
  };

  function memoKey(node) {
    let hk = "",
      cell = node.hist;
    for (let i = 0; i < node.uLeft && cell; i++, cell = cell.next)
      hk += cell.ckey + "";
    return node.ckey + "|u" + node.uLeft + "|H" + hk;
  }
  function materialize(node) {
    g.importState(node.snap);
    // importState does not touch .over; recompute it from the ckey suffix
    const o = node.ckey.slice(-1);
    g.over =
      o === "-"
        ? null
        : o === "W"
          ? { win: true }
          : { lose: true, reason: "replay" };
    g.undoLeft = node.uLeft;
    const arr = [];
    let cell = node.hist;
    for (
      let i = 0;
      i < Math.min(node.uLeft, 400) && cell;
      i++, cell = cell.next
    )
      arr.push(cell.snap);
    arr.reverse();
    g.hist = arr;
  }
  function rebuild(node) {
    let s = "";
    while (node.parent) {
      s = node.input + s;
      node = node.parent;
    }
    return s;
  }

  const seen = new Set([memoKey(root)]);
  const q = [root];
  let qi = 0;
  while (qi < q.length) {
    const node = q[qi++];
    if (node.depth >= maxDepth) continue;

    // move edges (only if not over)
    if (node.ckey.endsWith("|o-")) {
      for (const k of moveInputs) {
        materialize(node);
        const ev = g.input(k);
        if (!ev) continue;
        if (g.over && g.over.win)
          return {
            witness: rebuild(node) + k,
            nodes: seen.size,
            capped: false,
          };
        // policy: intended solutions never pass through a death state
        // (undo-from-death is a mercy mechanic, not a solution channel)
        if (g.over) continue;
        const child = {
          snap: g.exportState(),
          ckey: coreKey(g),
          uLeft: node.uLeft,
          hist: { snap: node.snap, ckey: node.ckey, next: node.hist },
          parent: node,
          input: k,
          depth: node.depth + 1,
        };
        const mk = memoKey(child);
        if (seen.has(mk)) continue;
        seen.add(mk);
        if (seen.size > maxNodes)
          return { witness: null, nodes: seen.size, capped: true };
        q.push(child);
      }
    }
    // Z edge (legal alive or dead, budget permitting, hist nonempty)
    if (node.uLeft > 0 && node.hist) {
      materialize(node);
      const r = g.undo();
      if (r.ok && !g.over) {
        // skip TIME THEFT children for the same death-free policy
        const child = {
          snap: g.exportState(),
          ckey: coreKey(g),
          uLeft: g.undoLeft,
          hist: node.hist.next,
          parent: node,
          input: "Z",
          depth: node.depth + 1,
        };
        const mk = memoKey(child);
        if (!seen.has(mk)) {
          seen.add(mk);
          if (seen.size > maxNodes)
            return { witness: null, nodes: seen.size, capped: true };
          q.push(child);
        }
      }
    }
  }
  return { witness: null, nodes: seen.size, capped: false };
}

/* ---------------- ascii playback ---------------- */
function board(g) {
  const out = [];
  for (let y = 0; y < g.h; y++) {
    let row = "";
    for (let x = 0; x < g.w; x++) {
      let c = g.sAt(x, y);
      if (c === "." && g.isBlood(x, y)) c = "~";
      const b = g.blockAt(x, y);
      if (b)
        c =
          b.kind === "meat"
            ? "M"
            : b.kind === "half"
              ? "m"
              : b.kind === "twitch"
                ? "W"
                : "F";
      if (g.hunter && g.hunter.alive && g.hunter.x === x && g.hunter.y === y)
        c = "U";
      if (g.warden && g.warden.x === x && g.warden.y === y) c = "K";
      if (
        g.player &&
        g.player.alive &&
        !g.player.exited &&
        g.player.x === x &&
        g.player.y === y
      )
        c = "P";
      row += c;
    }
    out.push(row);
  }
  return out.join("\n");
}
function play(def, str) {
  const g = new Game(def);
  console.log(
    `== ${def.id} quota ${def.quota} undos ${def.undos}\n` + board(g) + "\n",
  );
  for (const ch of str) {
    let note;
    if (ch === "Z") {
      const r = g.undo();
      note = r.ok ? `undo (left ${g.undoLeft})` : `undo DENIED (${r.why})`;
    } else {
      const ev = g.input(ch);
      note = ev ? ev.map((e) => e.t).join(",") : "no-op";
    }
    console.log(`-- ${ch}: ${note}  [mass ${g.quota.have}/${g.quota.need}]`);
    console.log(board(g) + "\n");
    if (g.over) {
      console.log("OVER:", JSON.stringify(g.over));
      break;
    }
  }
}

/* ---------------- CLI ---------------- */
const [, , cmd, idArg, strArg] = process.argv;
/* optional env caps for deep probes: MAXDEPTH=96 MAXNODES=2000000 */
const CAPS = {};
if (process.env.MAXDEPTH) CAPS.maxDepth = +process.env.MAXDEPTH;
if (process.env.MAXNODES) CAPS.maxNodes = +process.env.MAXNODES;
function runAll(def) {
  const errs = lint(def);
  if (errs.length) {
    console.log(`${def.id} LINT FAIL: ${errs.join("; ")}`);
    return false;
  }
  const noz = bfsNoZ(def);
  const zres = searchWithZ(def);
  const tight =
    def.undos > 0
      ? searchWithZ(def, { budget: def.undos - 1 })
      : { witness: null, capped: false };
  const wOk = zres.witness ? replayWitness(def, zres.witness) : { ok: false };
  console.log(
    `${def.id}: witness=${zres.witness || "NONE"} (${zres.nodes} nodes${zres.capped ? ", CAPPED" : ""})`,
  );
  console.log(
    `  replay=${wOk.ok ? "ok zUsed=" + wOk.zUsed + "/" + def.undos + " len=" + zres.witness.length : "FAIL " + (wOk.reason || "no witness")}`,
  );
  if (noz.solved) {
    const delta = noz.solved.length - (zres.witness ? zres.witness.length : 0);
    console.log(
      `  noZ: walkable in ${noz.solved.length} (witness${delta >= 0 ? "+" : ""}${delta}): ${noz.solved}`,
    );
  } else {
    console.log(
      `  noZ: ${noz.exhausted ? "proven undo-required (" + noz.states + " states)" : "INCONCLUSIVE (capped " + noz.states + ")"}`,
    );
  }
  console.log(
    `  budget-1: ${tight.witness ? "still solvable — budget loose: " + tight.witness : tight.capped ? "inconclusive (capped)" : "unsolvable — budget tight"}`,
  );
  return !!zres.witness && wOk.ok;
}

if (cmd === "lint") {
  for (const def of act3Defs()) {
    const errs = lint(def);
    console.log(def.id, errs.length ? "FAIL: " + errs.join("; ") : "ok");
  }
} else if (cmd === "noz") {
  console.log(JSON.stringify(bfsNoZ(defById(idArg)), null, 2));
} else if (cmd === "solve") {
  const r = searchWithZ(defById(idArg), { ...CAPS });
  console.log(JSON.stringify(r));
  if (r.witness)
    console.log(
      "replay:",
      JSON.stringify(replayWitness(defById(idArg), r.witness)),
    );
} else if (cmd === "tight") {
  const def = defById(idArg);
  console.log(
    JSON.stringify(searchWithZ(def, { budget: (def.undos || 0) - 1, ...CAPS })),
  );
} else if (cmd === "play") {
  play(defById(idArg), strArg || "");
} else if (cmd === "all") {
  let ok = true;
  for (const def of act3Defs()) ok = runAll(def) && ok;
  process.exit(ok ? 0 : 1);
} else {
  console.log(
    "usage: solve.js lint|noz <id>|solve <id>|tight <id>|play <id> <inputs>|all",
  );
}
