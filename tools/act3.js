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
   17 TIME THEFT  — one-door cold room; the warden corks the backtrack;
                    bait it deep, rewind past it (SHIPPED: noz-proven, tight).
   18 STILLNESS   — wait to freeze the hunter, one Z past the warden,
                    reclaim UNIT 9 on the blood (SHIPPED: noz-proven, tight).
   19 OVERTIME    — bait the warden onto the plate via the dead-end catwalk,
                    Z-burst down, push through the held gate (SHIPPED:
                    noz-proven, tight at 4).
   20 SEVERANCE   — finale: UNIT 9 self-severs on the opening lane; the
                    full overtime park covers the rest of the quota
                    (SHIPPED: noz-proven, tight at 4). Cork-the-pocket
                    designs all die to the pin: a chasing hunter camps the
                    cell behind the cork, adjacent to where any un-corking
                    push must land the player. Gates never help hunters:
                    they cannot STEP onto '=' even when open, and slides
                    rest on the bloodless gate tile. */
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
    undos: 2,
    name: "NIGHT 17 — TIME THEFT",
    map: [
      "########",
      "DK....P#",
      "######.#",
      "######.#",
      "###GM..#",
      "###....#",
      "########",
    ],
  },
  {
    id: "L18",
    act: 3,
    quota: 2,
    undos: 1,
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
      "##########+.#",
      "###########.#",
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
    undos: 4,
    name: "NIGHT 20 — SEVERANCE",
    map: [
      "##############",
      "#............#",
      "###########+.#",
      "############.#",
      "#K...........#",
      "#.M~=G#.....P#",
      "#D....#U.~~~G#",
      "##############",
    ],
  },
];

if (typeof module !== "undefined" && module.exports)
  module.exports = { LEVELS };
