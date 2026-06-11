
      /* RENDER — chambers. Act 1: you are UNIT 7. Act 2: you are what's left. */
      (function (global) {
        "use strict";

        const LEVELS = [
          // ---------------- ACT 1 ----------------
          {
            id: "L1",
            act: 1,
            quota: 2,
            name: "CHAMBER 01 — INTAKE",
            map: [
              "##########",
              "#........#",
              "#.P..M.G.#",
              "#........#",
              "####D#####",
            ],
          },
          {
            id: "L2",
            act: 1,
            quota: 4,
            name: "CHAMBER 02 — PERSUASION",
            map: [
              "#########",
              "#.P.....#",
              "#..M.M..#",
              "#...#...#",
              "#...G...#",
              "#.......#",
              "####D####",
            ],
          },
          {
            id: "L3",
            act: 1,
            quota: 4,
            name: "CHAMBER 03 — LUBRICATION",
            map: [
              "##########",
              "#P.M~~~G.#",
              "#........#",
              "#...M....#",
              "#........#",
              "#####D####",
            ],
          },
          {
            id: "L4",
            act: 1,
            quota: 4,
            name: "CHAMBER 04 — FLOW CONTROL",
            map: [
              "############",
              "#.P........#",
              "#.M~~~.~~..#",
              "#......G...#",
              "#.M........#",
              "#..........#",
              "#####D######",
            ],
          },
          {
            id: "L5",
            act: 1,
            quota: 1,
            name: "CHAMBER 05 — SUBDIVISION",
            map: [
              "###########",
              "#.........#",
              "#.P..M.S..#",
              "##.#####V##",
              "#.......G.#",
              "#.........#",
              "#####D#####",
            ],
          },
          {
            id: "L6",
            act: 1,
            quota: 3,
            name: "CHAMBER 06 — THROUGHPUT",
            map: [
              "############",
              "#.P........#",
              "#.M~~~S~~G.#",
              "#..M.....G.#",
              "#..........#",
              "#####D######",
            ],
          },
          {
            id: "L7",
            act: 1,
            quota: 2,
            name: "CHAMBER 07 — RETENTION",
            map: [
              "############",
              "#..........#",
              "#.P.M..M...#",
              "#..S....#=##",
              "#..+....#.##",
              "#.......#G##",
              "#####D######",
            ],
          },
          {
            id: "L8",
            act: 1,
            quota: 2,
            name: "CHAMBER 08 — LIVE HANDLING",
            map: [
              "###########",
              "#.P.......#",
              "#....G....#",
              "#.W......O#",
              "#.........#",
              "#####D#####",
            ],
            meta: { facing: { "2,3": "R" } },
          },
          {
            id: "L9",
            act: 1,
            quota: 2,
            name: "CHAMBER 09 — COMPLIANCE",
            map: [
              "############",
              "#.P........#",
              "#..........#",
              "##...F...G##",
              "#..........#",
              "#####D######",
            ],
          },
          // ---------------- ACT 2 ----------------
          {
            id: "L10",
            act: 2,
            quota: 0,
            name: "RECLAMATION PEN 04",
            map: [
              "##########",
              "#.P.S..+.#",
              "#........#",
              "####V#####",
              "#......=D#",
              "##########",
            ],
          },
          {
            id: "L11",
            act: 2,
            quota: 0,
            name: "SORTING",
            map: [
              "############",
              "#.P....#...#",
              "#..##..#.M.#",
              "#..##......#",
              "#.......##.#",
              "#..U....##D#",
              "############",
            ],
          },
          {
            id: "L12",
            act: 2,
            quota: 2,
            name: "RENDERING",
            map: [
              "############",
              "#G.........#",
              "######P.##.#",
              "######D###.#",
              "##########.#",
              "##########.#",
              "##########U#",
              "############",
            ],
          },
          {
            id: "L13",
            act: 2,
            quota: 1,
            name: "SUBDIVISION B",
            map: [
              "############",
              "#P.........#",
              "#.S~~~~...U#",
              "#..........#",
              "#G.........#",
              "#....D.....#",
              "############",
            ],
          },
          {
            id: "L14",
            act: 2,
            quota: 2,
            name: "COLD CHAIN",
            map: [
              "###########",
              "#....######",
              "#P.S.V..=D#",
              "#+...######",
              "#G~~~~~..U#",
              "###########",
            ],
          },
          {
            id: "L15",
            act: 2,
            quota: 1,
            name: "SHIPPING",
            map: [
              "##############",
              "#......G.....#",
              "#............#",
              "#..##....##..#",
              "#..##....##..#",
              "#............#",
              "#.S.#..P.U..D#",
              "#..G#........#",
              "##############",
            ],
          },
          // ---------------- ACT 3 · NIGHT SHIFT ----------------
          // The warden (K) chases but never rewinds; undo is metered.
          // Witness (solver-verified, uses full budget):
          //   LRRRLLLLLLLLLUUUURURRRDDDUUULLLLDUDURZZDDDDD
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
        ];

        const api = { LEVELS };
        if (typeof module !== "undefined" && module.exports)
          module.exports = api;
        else global.RenderLevels = api;
      })(typeof window !== "undefined" ? window : globalThis);
    