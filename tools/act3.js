/* Act 3 wave 1 design scratchpad. Overrides shipped defs by id in solve.js.
   Design laws learned the hard way (see memory/witness runs):
   - Undo rewinds the WORLD (quota included). A witness is always:
     [work] -> [work-free bait walk] -> [Z-burst popping only the bait]
     -> [flee]. Z returns P to where the work ENDED, warden displaced.
   - A trailing warden never catches a forward-only player; forcing Z
     requires backtracking work, or gates (warden-illegal terrain).
   - Greedy-chase freeze cells are farmable; no-Z exotic lines exist in
     most open maps. Bar: proven-impossible OR noz much longer than witness.
   Verbs:
   16 CLOCKING IN — bait, rewind past the warden, race the dead-end grind.
   17 TIME THEFT  — L-bend shaft needs a backtrack; the trail kills it.
   18 STILLNESS   — hunter rewinds, warden doesn't; desync the two.
   19 OVERTIME    — park the warden ON the plate; it holds the gate open.
   20 SEVERANCE   — park it, then cork the pocket with meat; grind UNIT 9. */
"use strict";

const LEVELS = [
  {
    id: "L16",
    act: 3,
    quota: 2,
    undos: 2,
    name: "NIGHT 16 — CLOCKING IN",
    map: [
      "############",
      "#.....K....#",
      "#..##.####.#",
      "#.###.####.#",
      "#.###M####.#",
      "#.###G####.#",
      "#.......P..#",
      "#D##########",
    ],
  },
  {
    id: "L17",
    act: 3,
    quota: 2,
    undos: 3,
    name: "NIGHT 17 — TIME THEFT",
    map: [
      "############",
      "#.......K..#",
      "#.####.###.#",
      "#.#..M...#.#",
      "#.#.##G###.#",
      "#.#.######.#",
      "#........P.#",
      "######D#####",
    ],
  },
  {
    id: "L18",
    act: 3,
    quota: 2,
    undos: 3,
    name: "NIGHT 18 — STILLNESS",
    map: [
      "#############",
      "#.....K.....#",
      "#.G~~~......#",
      "#P.###......#",
      "#..####..U..#",
      "#..#........#",
      "#..#.D......#",
      "#############",
    ],
  },
  {
    id: "L19",
    act: 3,
    quota: 2,
    undos: 4,
    name: "NIGHT 19 — OVERTIME",
    map: [
      "#############",
      "#...........#",
      "#.########+.#",
      "#.#########.#",
      "#K..........#",
      "#.M~=G#.....#",
      "#D....#..P..#",
      "#############",
    ],
  },
  {
    id: "L20",
    act: 3,
    quota: 4,
    undos: 2,
    name: "NIGHT 20 — SEVERANCE",
    map: [
      "##############",
      "#............#",
      "#.#########+.#",
      "#.##########.#",
      "#............#",
      "#.M~=G#..M.U.#",
      "#D....#......#",
      "#######...P..#",
      "##############",
    ],
    meta: { entities: [{ t: "K", x: 8, y: 1 }] },
  },
];

if (typeof module !== "undefined" && module.exports)
  module.exports = { LEVELS };
