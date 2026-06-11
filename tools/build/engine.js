
      /* ============================================================
   RENDER — core engine (pure logic, no DOM)
   Tiles:  # wall   (space) void   . floor   G grinder   S saw
           D door   + plate   = gate   V vent (half-only)
           O drain  ~ pre-bloodied floor
   Entities in map: P player  M meat  m half  W twitcher  F fleer  U hunter
                    K warden (act 3)
   Rules:
   - Anything that moves onto a bloody tile slides in its direction
     of travel until it lands on a dry tile or is stopped/consumed.
   - Full meat (blocks, twitchers, fleers, meat-player) bleeds onto
     every tile it departs. Halves are drained and never bleed.
   - Saw cuts full meat entering it: back half rests on the saw,
     front half continues one tile (must be landable or move fails).
   - Grinder consumes blocks (+mass). Unit player is railed out;
     meat player dies; hunter only enters by sliding.
   - Vents pass half-sized movers only.
   - Door opens at quota; only the player may exit. Product may not leave.
   - Act 3: the warden chases like the hunter but never slides on blood,
     cannot be killed, and is NOT part of undo snapshots. Undo rewinds
     the world; the warden keeps its position. Undos are budgeted
     (def.undos). Rewinding onto the warden's tile is death (TIME THEFT);
     a block rewound onto its tile is confiscated.
   ============================================================ */
      (function (global) {
        "use strict";

        const DIRS = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
        const MASS = { meat: 2, twitch: 2, fleer: 2, half: 1, hunter: 2 };
        const BLEEDS = { meat: true, twitch: true, fleer: true, half: false };

        class Game {
          constructor(def) {
            this.def = def;
            this.reset();
          }

          reset() {
            const def = this.def;
            const rows = def.map;
            this.w = Math.max(...rows.map((r) => r.length));
            this.h = rows.length;
            this.stat = new Array(this.w * this.h).fill(" ");
            this.blood = new Set();
            this.blocks = [];
            this.player = null;
            this.hunter = null;
            this.warden = null;
            this.plates = [];
            this.gates = [];
            this.doors = [];
            this.act = def.act || 1;
            this.quota = { need: def.quota || 0, have: 0 };
            this.sources = { hunter: false, self: false, product: false };
            this.moves = 0;
            this.over = null;
            this.hist = [];
            this.bid = 1;
            this.undoMax = def.undos === undefined ? Infinity : def.undos;
            this.undoLeft = this.undoMax;

            const facing = (def.meta && def.meta.facing) || {};
            for (let y = 0; y < this.h; y++) {
              const row = rows[y];
              for (let x = 0; x < this.w; x++) {
                const c = x < row.length ? row[x] : " ";
                let s = c;
                switch (c) {
                  case "~":
                    s = ".";
                    this.blood.add(this.i(x, y));
                    break;
                  case "P":
                    s = ".";
                    this.player = {
                      x,
                      y,
                      size: "full",
                      meat: this.act === 2,
                      alive: true,
                    };
                    break;
                  case "M":
                    s = ".";
                    this.blocks.push(this.mkBlock("meat", x, y));
                    break;
                  case "m":
                    s = ".";
                    this.blocks.push(this.mkBlock("half", x, y));
                    break;
                  case "W":
                    s = ".";
                    this.blocks.push(
                      this.mkBlock("twitch", x, y, facing[x + "," + y] || "R"),
                    );
                    break;
                  case "F":
                    s = ".";
                    this.blocks.push(this.mkBlock("fleer", x, y));
                    break;
                  case "U":
                    s = ".";
                    this.hunter = { x, y, alive: true };
                    break;
                  case "K":
                    s = ".";
                    this.warden = { x, y };
                    break;
                  case "+":
                    this.plates.push([x, y]);
                    break;
                  case "=":
                    this.gates.push([x, y]);
                    break;
                  case "D":
                    this.doors.push([x, y]);
                    break;
                }
                this.stat[this.i(x, y)] = s;
              }
            }
            // layered extras (e.g. entity standing on a plate)
            if (def.meta && def.meta.entities) {
              for (const e of def.meta.entities) {
                if (e.t === "M" || e.t === "m" || e.t === "W" || e.t === "F") {
                  const kind =
                    e.t === "M"
                      ? "meat"
                      : e.t === "m"
                        ? "half"
                        : e.t === "W"
                          ? "twitch"
                          : "fleer";
                  this.blocks.push(this.mkBlock(kind, e.x, e.y, e.f || "R"));
                } else if (e.t === "P")
                  this.player = {
                    x: e.x,
                    y: e.y,
                    size: "full",
                    meat: this.act === 2,
                    alive: true,
                  };
                else if (e.t === "U")
                  this.hunter = { x: e.x, y: e.y, alive: true };
                else if (e.t === "K") this.warden = { x: e.x, y: e.y };
              }
            }
            if (def.meta && def.meta.bloodAt)
              for (const [bx, by] of def.meta.bloodAt)
                this.blood.add(this.i(bx, by));
          }

          mkBlock(kind, x, y, facing) {
            return {
              id: this.bid++,
              kind,
              x,
              y,
              facing: facing || "R",
              src: "product",
              mine: false,
            };
          }

          i(x, y) {
            return y * this.w + x;
          }
          sAt(x, y) {
            if (x < 0 || y < 0 || x >= this.w || y >= this.h) return " ";
            return this.stat[this.i(x, y)];
          }
          isBlood(x, y) {
            return this.blood.has(this.i(x, y));
          }
          blockAt(x, y) {
            return this.blocks.find((b) => b.x === x && b.y === y) || null;
          }
          hunterAt(x, y) {
            return (
              this.hunter &&
              this.hunter.alive &&
              this.hunter.x === x &&
              this.hunter.y === y
            );
          }
          playerAt(x, y) {
            return (
              this.player &&
              this.player.alive &&
              !this.player.exited &&
              this.player.x === x &&
              this.player.y === y
            );
          }
          wardenAt(x, y) {
            return this.warden && this.warden.x === x && this.warden.y === y;
          }
          occupied(x, y) {
            return (
              this.blockAt(x, y) ||
              this.hunterAt(x, y) ||
              this.wardenAt(x, y) ||
              this.playerAt(x, y)
            );
          }

          platesPressed() {
            let n = 0;
            for (const [x, y] of this.plates) if (this.occupied(x, y)) n++;
            return n;
          }
          gateOpenAt(x, y) {
            return this.platesPressed() > 0 || !!this.occupied(x, y);
          }
          doorOpen() {
            return this.quota.have >= this.quota.need;
          }

          addMass(n, src, ev, x, y) {
            this.quota.have += n;
            if (src === "hunter") this.sources.hunter = true;
            else if (src === "self") this.sources.self = true;
            else this.sources.product = true;
            ev.push({ t: "mass", n, x, y, total: this.quota.have, src });
            if (this.doorOpen() && !this._doorWas) {
              this._doorWas = true;
              ev.push({ t: "door" });
            }
          }

          bleedAt(x, y, ev) {
            const k = this.i(x, y);
            if (
              !this.blood.has(k) &&
              (this.sAt(x, y) === "." ||
                this.sAt(x, y) === "+" ||
                this.sAt(x, y) === "V")
            ) {
              this.blood.add(k);
              ev.push({ t: "bleed", x, y });
            }
          }

          /* ---------- block travel ----------
       Moves block b one tile in dir, then resolves slides.
       firstMustSucceed: a push fails entirely if the first step is blocked.
       Returns true if the block moved/was consumed/cut. */
          travelBlock(b, dir, ev, firstMustSucceed) {
            const [dx, dy] = DIRS[dir];
            let first = true;
            let guard = 0;
            while (guard++ < 128) {
              const nx = b.x + dx,
                ny = b.y + dy;
              const s = this.sAt(nx, ny);
              const stop = () => !first;
              // hard blockers
              if (s === "#" || s === " " || s === "D") return stop();
              if (s === "=" && !this.gateOpenAt(nx, ny)) return stop();
              if (s === "V" && b.kind !== "half") return stop();
              if (this.occupied(nx, ny)) return stop();
              if (s === "O") {
                // drain: lost, no mass
                if (BLEEDS[b.kind]) this.bleedAt(b.x, b.y, ev);
                this.blocks = this.blocks.filter((q) => q !== b);
                ev.push({ t: "drain", x: nx, y: ny, kind: b.kind });
                return true;
              }
              if (s === "G") {
                // ground: mass accepted
                if (BLEEDS[b.kind]) this.bleedAt(b.x, b.y, ev);
                this.blocks = this.blocks.filter((q) => q !== b);
                this.addMass(MASS[b.kind], b.mine ? "self" : b.src, ev, nx, ny);
                ev.push({ t: "grind", x: nx, y: ny, kind: b.kind });
                return true;
              }
              if (s === "S") {
                if (b.kind === "half") {
                  // a half rests on / passes over the blade
                  if (BLEEDS[b.kind]) this.bleedAt(b.x, b.y, ev);
                  b.x = nx;
                  b.y = ny;
                  first = false;
                  ev.push({ t: "step", id: b.id, x: nx, y: ny });
                  if (this.isBlood(nx, ny)) continue;
                  return true;
                }
                // full meat: cut. Front half must be able to enter the beyond tile.
                const fx = nx + dx,
                  fy = ny + dy;
                const probe = this.halfEntry(fx, fy);
                if (probe === "blocked") return stop();
                if (BLEEDS[b.kind]) this.bleedAt(b.x, b.y, ev);
                // back half rests on the saw
                b.kind = "half";
                b.x = nx;
                b.y = ny;
                ev.push({ t: "cut", x: nx, y: ny, src: b.src, mine: b.mine });
                // front half
                const front = {
                  id: this.bid++,
                  kind: "half",
                  x: nx,
                  y: ny,
                  facing: b.facing,
                  src: b.src,
                  mine: b.mine,
                };
                this.resolveHalfEntry(front, fx, fy, dir, ev, probe);
                return true;
              }
              // plain enterable: floor / plate / vent(half)
              if (BLEEDS[b.kind]) this.bleedAt(b.x, b.y, ev);
              b.x = nx;
              b.y = ny;
              first = false;
              ev.push({ t: "step", id: b.id, x: nx, y: ny });
              if (this.isBlood(nx, ny) || s === "V") continue; // vents are chutes: product falls through
              return true;
            }
            return true;
          }

          halfEntry(x, y) {
            const s = this.sAt(x, y);
            if (s === "#" || s === " " || s === "D") return "blocked";
            if (s === "=" && !this.gateOpenAt(x, y)) return "blocked";
            if (this.occupied(x, y)) return "blocked";
            if (s === "G") return "grind";
            if (s === "O") return "drain";
            return "ok"; // floor, plate, vent, saw (halves sit on saws)
          }

          resolveHalfEntry(half, x, y, dir, ev, probe) {
            if (probe === "grind") {
              this.addMass(1, half.mine ? "self" : half.src, ev, x, y);
              ev.push({ t: "grind", x, y, kind: "half" });
              return;
            }
            if (probe === "drain") {
              ev.push({ t: "drain", x, y, kind: "half" });
              return;
            }
            half.x = x;
            half.y = y;
            this.blocks.push(half);
            ev.push({
              t: "spawnHalf",
              id: half.id,
              x,
              y,
              mine: half.mine,
              src: half.src,
            });
            if (this.isBlood(x, y) || this.sAt(x, y) === "V")
              this.travelBlock(half, dir, ev, false);
          }

          /* ---------- player ---------- */
          movePlayer(dir, ev) {
            const p = this.player;
            const [dx, dy] = DIRS[dir];
            let moved = false;
            let guard = 0;
            while (guard++ < 128) {
              const nx = p.x + dx,
                ny = p.y + dy;
              const s = this.sAt(nx, ny);
              if (s === "#" || s === " " || s === "O") break;
              if (s === "=" && !this.gateOpenAt(nx, ny)) break;
              if (s === "V" && p.size !== "half") break;
              if (s === "D") {
                if (this.doorOpen()) {
                  if (p.meat && p.size === "full") this.bleedAt(p.x, p.y, ev);
                  p.x = nx;
                  p.y = ny;
                  p.exited = true;
                  moved = true;
                  this.over = {
                    win: true,
                    sources: { ...this.sources },
                    size: p.size,
                  };
                  ev.push({ t: "exit", x: nx, y: ny });
                }
                break;
              }
              if (s === "G") {
                if (!p.meat) {
                  ev.push({ t: "rail" });
                  break;
                }
                if (p.meat && p.size === "full") this.bleedAt(p.x, p.y, ev);
                p.x = nx;
                p.y = ny;
                p.alive = false;
                moved = true;
                this.over = { lose: true, reason: "RENDERED" };
                ev.push({ t: "playerGround", x: nx, y: ny });
                break;
              }
              if (this.hunterAt(nx, ny) || this.wardenAt(nx, ny)) break;
              const b = this.blockAt(nx, ny);
              if (b) {
                if (moved) break; // no traction while sliding
                // standing tile after the push is the tile the block rests on now
                if (s === "S" && (!p.meat || p.size !== "half")) break;
                const before = { x: b.x, y: b.y };
                const ok = this.travelBlock(b, dir, ev, true);
                if (!ok) break;
                ev.push({ t: "push", x: before.x, y: before.y });
                if (p.meat && p.size === "full") this.bleedAt(p.x, p.y, ev);
                p.x = nx;
                p.y = ny;
                moved = true;
                ev.push({ t: "pstep", x: nx, y: ny });
                if (this.isBlood(nx, ny)) continue;
                break;
              }
              if (s === "S") {
                if (!p.meat) {
                  ev.push({ t: "rail", saw: true });
                  break;
                }
                if (p.size === "half") {
                  p.x = nx;
                  p.y = ny;
                  p.alive = false;
                  moved = true;
                  this.over = { lose: true, reason: "SUBDIVIDED" };
                  ev.push({ t: "playerSawDeath", x: nx, y: ny });
                  break;
                }
                // self-cut: you keep going; half of you does not.
                const fx = nx + dx,
                  fy = ny + dy;
                const probe = this.halfPlayerEntry(fx, fy);
                if (probe === "blocked") break;
                this.bleedAt(p.x, p.y, ev); // you bleed the tile you leave as you walk into the blade
                const sev = {
                  id: this.bid++,
                  kind: "half",
                  x: nx,
                  y: ny,
                  facing: "R",
                  src: "product",
                  mine: true,
                };
                this.blocks.push(sev);
                p.size = "half";
                ev.push({ t: "selfCut", x: nx, y: ny, halfId: sev.id });
                if (probe === "exit") {
                  p.x = fx;
                  p.y = fy;
                  p.exited = true;
                  moved = true;
                  this.over = {
                    win: true,
                    sources: { ...this.sources },
                    size: p.size,
                  };
                  ev.push({ t: "exit", x: fx, y: fy });
                  break;
                }
                if (probe === "grind") {
                  p.x = fx;
                  p.y = fy;
                  p.alive = false;
                  moved = true;
                  this.over = { lose: true, reason: "RENDERED" };
                  ev.push({ t: "playerGround", x: fx, y: fy });
                  break;
                }
                p.x = fx;
                p.y = fy;
                moved = true;
                ev.push({ t: "pstep", x: fx, y: fy });
                if (this.isBlood(fx, fy)) continue;
                break;
              }
              // plain: floor / plate / vent(half)
              if (p.meat && p.size === "full") this.bleedAt(p.x, p.y, ev);
              p.x = nx;
              p.y = ny;
              moved = true;
              ev.push({ t: "pstep", x: nx, y: ny });
              if (this.isBlood(nx, ny)) continue;
              break;
            }
            return moved;
          }

          halfPlayerEntry(x, y) {
            const s = this.sAt(x, y);
            if (s === "#" || s === " " || s === "O" || s === "S")
              return "blocked";
            if (s === "=" && !this.gateOpenAt(x, y)) return "blocked";
            if (this.occupied(x, y)) return "blocked";
            if (this.hunterAt(x, y)) return "blocked";
            if (s === "D") return this.doorOpen() ? "exit" : "blocked";
            if (s === "G") return "grind";
            return "ok";
          }

          /* ---------- autonomous product ---------- */
          twitchersAct(ev) {
            for (const b of this.blocks.slice()) {
              if (b.kind !== "twitch" || !this.blocks.includes(b)) continue;
              const before = { x: b.x, y: b.y };
              const moved = this.travelBlock(b, b.facing, ev, true);
              ev.push({
                t: moved ? "twitch" : "wiggle",
                x: before.x,
                y: before.y,
                id: b.id,
              });
              if (this.over) return;
            }
          }

          fleersAct(ev) {
            const p = this.player;
            for (const b of this.blocks.slice()) {
              if (b.kind !== "fleer" || !this.blocks.includes(b)) continue;
              let dir = null;
              if (
                b.x === p.x &&
                b.y !== p.y &&
                Math.abs(b.y - p.y) <= 4 &&
                this.clearLine(b.x, b.y, p.x, p.y)
              ) {
                dir = b.y > p.y ? "D" : "U";
              } else if (
                b.y === p.y &&
                b.x !== p.x &&
                Math.abs(b.x - p.x) <= 4 &&
                this.clearLine(b.x, b.y, p.x, p.y)
              ) {
                dir = b.x > p.x ? "R" : "L";
              }
              if (!dir) continue;
              const moved = this.travelBlock(b, dir, ev, true);
              ev.push({
                t: moved ? "flee" : "cower",
                id: b.id,
                x: b.x,
                y: b.y,
              });
              if (this.over) return;
            }
          }

          clearLine(x0, y0, x1, y1) {
            const dx = Math.sign(x1 - x0),
              dy = Math.sign(y1 - y0);
            let x = x0 + dx,
              y = y0 + dy;
            while (x !== x1 || y !== y1) {
              const s = this.sAt(x, y);
              if (s === "#" || s === " ") return false;
              if (s === "=" && !this.gateOpenAt(x, y)) return false;
              if (
                this.blockAt(x, y) ||
                this.hunterAt(x, y) ||
                this.wardenAt(x, y)
              )
                return false;
              x += dx;
              y += dy;
            }
            return true;
          }

          /* ---------- the hunter ---------- */
          hunterStepOk(x, y) {
            const s = this.sAt(x, y);
            if (!(s === "." || s === "+")) return false; // avoids blades, pits, vents, drains, doors, gates
            if (this.blockAt(x, y)) return false;
            if (this.wardenAt(x, y)) return false;
            return true;
          }

          hunterAct(ev) {
            const h = this.hunter;
            if (!h || !h.alive || this.over) return;
            const p = this.player;
            const dx = p.x - h.x,
              dy = p.y - h.y;
            const cand = [];
            const hx = dx > 0 ? "R" : "L",
              vy = dy > 0 ? "D" : "U";
            if (Math.abs(dx) >= Math.abs(dy)) {
              if (dx !== 0) cand.push(hx);
              if (dy !== 0) cand.push(vy);
            } else {
              if (dy !== 0) cand.push(vy);
              if (dx !== 0) cand.push(hx);
            }
            for (const dir of cand) {
              const [mx, my] = DIRS[dir];
              const nx = h.x + mx,
                ny = h.y + my;
              if (this.playerAt(nx, ny)) {
                h.x = nx;
                h.y = ny;
                this.over = { lose: true, reason: "RECLAIMED" };
                ev.push({ t: "caught", x: nx, y: ny });
                return;
              }
              if (this.hunterStepOk(nx, ny)) {
                h.x = nx;
                h.y = ny;
                ev.push({ t: "hstep", x: nx, y: ny, dir });
                this.hunterSlide(dir, ev);
                return;
              }
            }
            ev.push({ t: "hstuck", x: h.x, y: h.y });
          }

          hunterSlide(dir, ev) {
            const h = this.hunter;
            const [dx, dy] = DIRS[dir];
            let guard = 0;
            while (h.alive && this.isBlood(h.x, h.y) && guard++ < 128) {
              const nx = h.x + dx,
                ny = h.y + dy;
              const s = this.sAt(nx, ny);
              if (this.playerAt(nx, ny)) {
                h.x = nx;
                h.y = ny;
                this.over = { lose: true, reason: "RECLAIMED" };
                ev.push({ t: "caught", x: nx, y: ny, slid: true });
                return;
              }
              if (s === "G") {
                h.alive = false;
                h.x = nx;
                h.y = ny;
                this.addMass(MASS.hunter, "hunter", ev, nx, ny);
                ev.push({ t: "hunterGround", x: nx, y: ny });
                return;
              }
              if (s === "S") {
                const px = h.x,
                  py = h.y;
                h.alive = false;
                h.x = nx;
                h.y = ny;
                ev.push({ t: "hunterCut", x: nx, y: ny });
                const a = {
                  id: this.bid++,
                  kind: "half",
                  x: nx,
                  y: ny,
                  facing: dir,
                  src: "hunter",
                  mine: false,
                };
                this.blocks.push(a);
                ev.push({
                  t: "spawnHalf",
                  id: a.id,
                  x: nx,
                  y: ny,
                  src: "hunter",
                });
                const fx = nx + dx,
                  fy = ny + dy;
                const probe = this.halfEntry(fx, fy);
                const b = {
                  id: this.bid++,
                  kind: "half",
                  x: 0,
                  y: 0,
                  facing: dir,
                  src: "hunter",
                  mine: false,
                };
                if (probe === "blocked") {
                  b.x = px;
                  b.y = py;
                  this.blocks.push(b);
                  ev.push({
                    t: "spawnHalf",
                    id: b.id,
                    x: px,
                    y: py,
                    src: "hunter",
                  });
                } else this.resolveHalfEntry(b, fx, fy, dir, ev, probe);
                return;
              }
              if (s === "#" || s === " " || s === "V" || s === "D" || s === "O")
                return;
              if (s === "=" && !this.gateOpenAt(nx, ny)) return;
              if (this.blockAt(nx, ny)) return;
              h.x = nx;
              h.y = ny;
              ev.push({ t: "hslide", x: nx, y: ny });
            }
          }

          /* ---------- the warden (act 3) ----------
             Chases like the hunter, with night-shift hardware:
             rated for wet floors (never slides), no mass (cannot be
             ground, cut, or pushed), and it does not rewind. */
          wardenStepOk(x, y) {
            const s = this.sAt(x, y);
            if (!(s === "." || s === "+")) return false;
            if (this.blockAt(x, y)) return false;
            if (this.hunterAt(x, y)) return false;
            return true;
          }

          wardenAct(ev) {
            const k = this.warden;
            if (!k || this.over) return;
            const p = this.player;
            const dx = p.x - k.x,
              dy = p.y - k.y;
            const cand = [];
            const hx = dx > 0 ? "R" : "L",
              vy = dy > 0 ? "D" : "U";
            if (Math.abs(dx) >= Math.abs(dy)) {
              if (dx !== 0) cand.push(hx);
              if (dy !== 0) cand.push(vy);
            } else {
              if (dy !== 0) cand.push(vy);
              if (dx !== 0) cand.push(hx);
            }
            for (const dir of cand) {
              const [mx, my] = DIRS[dir];
              const nx = k.x + mx,
                ny = k.y + my;
              const s = this.sAt(nx, ny);
              if (this.playerAt(nx, ny)) {
                // it cannot reach through bars: a player on a gate is safe
                if (!(s === "." || s === "+")) continue;
                k.x = nx;
                k.y = ny;
                this.over = { lose: true, reason: "DETAINED" };
                ev.push({ t: "caught", x: nx, y: ny, warden: true });
                return;
              }
              if (this.wardenStepOk(nx, ny)) {
                k.x = nx;
                k.y = ny;
                ev.push({ t: "kstep", x: nx, y: ny, dir });
                return;
              }
            }
            ev.push({ t: "kstuck", x: k.x, y: k.y });
          }

          /* Mirror of wardenAct without mutation: where the warden would
             step if the player stayed put. null = no warden; {stuck:true}
             = its greedy chase is frozen here (farmable). For the HUD. */
          peekWarden() {
            const k = this.warden;
            if (!k) return null;
            const p = this.player;
            const dx = p.x - k.x,
              dy = p.y - k.y;
            const cand = [];
            const hx = dx > 0 ? "R" : "L",
              vy = dy > 0 ? "D" : "U";
            if (Math.abs(dx) >= Math.abs(dy)) {
              if (dx !== 0) cand.push(hx);
              if (dy !== 0) cand.push(vy);
            } else {
              if (dy !== 0) cand.push(vy);
              if (dx !== 0) cand.push(hx);
            }
            for (const dir of cand) {
              const [mx, my] = DIRS[dir];
              const nx = k.x + mx,
                ny = k.y + my;
              const s = this.sAt(nx, ny);
              if (this.playerAt(nx, ny)) {
                if (!(s === "." || s === "+")) continue;
                return { stuck: false, x: nx, y: ny, dir, reach: true };
              }
              if (this.wardenStepOk(nx, ny))
                return { stuck: false, x: nx, y: ny, dir, reach: false };
            }
            return { stuck: true };
          }

          /* ---------- turn ---------- */
          input(key) {
            // 'U','D','L','R','W' (wait, acts 2+)
            if (this.over) return null;
            const snap = this.exportState();
            const ev = [];
            let acted = false;
            if (key === "W") {
              if (this.act >= 2) {
                acted = true;
                ev.push({ t: "wait" });
              }
            } else if (DIRS[key]) {
              acted = this.movePlayer(key, ev);
            }
            if (!acted) return null;
            this.hist.push(snap);
            if (this.hist.length > 400) this.hist.shift();
            this.moves++;
            if (!this.over) {
              this.fleersAct(ev);
              if (!this.over && this.moves % 2 === 0) this.twitchersAct(ev);
              if (!this.over) this.hunterAct(ev);
              if (!this.over) this.wardenAct(ev);
            }
            if (this.over) ev.push({ t: "over", over: this.over });
            return ev;
          }

          /* Undo rewinds the world but not the warden, and not the meter.
             Returns { ok, why?, ev? }. The player can rewind from a death
             screen; rewinding onto the warden's tile is itself a death. */
          undo() {
            if (!this.hist.length) return { ok: false, why: "empty" };
            if (this.undoLeft <= 0) return { ok: false, why: "budget" };
            const keepW = this.warden ? { ...this.warden } : null;
            const keepU = this.undoLeft;
            this.importState(this.hist.pop());
            if (keepW) this.warden = keepW;
            this.undoLeft = keepU - 1;
            this.over = null;
            const ev = [{ t: "undo", left: this.undoLeft }];
            if (keepW) {
              const crushed = this.blocks.filter(
                (b) => b.x === keepW.x && b.y === keepW.y,
              );
              if (crushed.length) {
                this.blocks = this.blocks.filter((b) => !crushed.includes(b));
                for (const b of crushed)
                  ev.push({ t: "confiscate", x: b.x, y: b.y, kind: b.kind });
              }
              if (
                this.player.alive &&
                !this.player.exited &&
                this.player.x === keepW.x &&
                this.player.y === keepW.y
              ) {
                this.player.alive = false;
                this.over = { lose: true, reason: "TIME THEFT" };
                ev.push({ t: "caught", x: keepW.x, y: keepW.y, warden: true });
                ev.push({ t: "over", over: this.over });
              }
            }
            return { ok: true, ev };
          }

          /* Where would Z put you? For the act-3 ghost marker. */
          peekUndo() {
            const chain = this.peekUndoChain();
            return chain.length ? chain[0] : null;
          }

          /* Where would each remaining Z land you, in order (Z, ZZ, …)?
             For the act-3 ghost trail. danger = warden stands there now. */
          peekUndoChain() {
            const out = [];
            const n = Math.min(this.undoLeft, this.hist.length);
            for (let i = 1; i <= n; i++) {
              const s = this.hist[this.hist.length - i];
              out.push({
                x: s.player.x,
                y: s.player.y,
                depth: i,
                danger: !!(
                  this.warden &&
                  this.warden.x === s.player.x &&
                  this.warden.y === s.player.y
                ),
              });
            }
            return out;
          }

          /* ---------- state ---------- */
          exportState() {
            return {
              player: { ...this.player },
              blocks: this.blocks.map((b) => ({ ...b })),
              hunter: this.hunter ? { ...this.hunter } : null,
              warden: this.warden ? { ...this.warden } : null,
              blood: Array.from(this.blood),
              quota: { ...this.quota },
              sources: { ...this.sources },
              moves: this.moves,
              doorWas: this._doorWas || false,
              bid: this.bid,
            };
          }
          importState(s) {
            this.player = { ...s.player };
            this.blocks = s.blocks.map((b) => ({ ...b }));
            this.hunter = s.hunter ? { ...s.hunter } : null;
            this.warden = s.warden ? { ...s.warden } : null;
            this.blood = new Set(s.blood);
            this.quota = { ...s.quota };
            this.sources = { ...s.sources };
            this.moves = s.moves;
            this._doorWas = s.doorWas;
            this.bid = s.bid;
          }
          hashKey() {
            const p = this.player;
            const bl = this.blocks
              .map((b) => b.kind[0] + (b.mine ? "!" : "") + b.x + "," + b.y)
              .sort()
              .join(";");
            const h =
              this.hunter && this.hunter.alive
                ? this.hunter.x + "," + this.hunter.y
                : "x";
            const hasT = this.blocks.some((b) => b.kind === "twitch");
            return (
              p.x +
              "," +
              p.y +
              "," +
              p.size[0] +
              "|" +
              bl +
              "|" +
              h +
              "|" +
              Array.from(this.blood)
                .sort((a, b) => a - b)
                .join(",") +
              "|" +
              this.quota.have +
              "|" +
              (hasT ? this.moves % 2 : 0) +
              "|K" +
              (this.warden ? this.warden.x + "," + this.warden.y : "x")
            );
          }
        }

        const api = { Game, DIRS, MASS };
        if (typeof module !== "undefined" && module.exports)
          module.exports = api;
        else global.RenderEngine = api;
      })(typeof window !== "undefined" ? window : globalThis);
    