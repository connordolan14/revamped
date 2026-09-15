import { describe, it, expect } from "vitest";
import { starterStrength, nameKey, ValueMap, RosterPlayerMeta } from "../src/core/rosterStrength.js";

function roster(players: { id: string; name: string; pos: string; value: number }[]) {
  const playerIds = players.map((p) => p.id);
  const playersById: Record<string, RosterPlayerMeta> = {};
  const values: ValueMap = new Map();
  for (const p of players) {
    playersById[p.id] = { full_name: p.name, position: p.pos };
    values.set(nameKey(p.name, p.pos), p.value);
  }
  return { playerIds, playersById, values };
}

describe("starterStrength", () => {
  it("fills FLEX with the best remaining RB/WR/TE regardless of position", () => {
    // Fixed slots (QB x2, RB x2, WR x2, TE x1) exhaust the cheap players;
    // a strong 3rd RB should out-value weak 3rd/4th WRs for the 3 FLEX spots.
    const { playerIds, playersById, values } = roster([
      { id: "qb1", name: "QB One", pos: "QB", value: 100 },
      { id: "qb2", name: "QB Two", pos: "QB", value: 90 },
      { id: "rb1", name: "RB One", pos: "RB", value: 80 },
      { id: "rb2", name: "RB Two", pos: "RB", value: 70 },
      { id: "rb3", name: "RB Three", pos: "RB", value: 60 }, // should win a FLEX slot
      { id: "wr1", name: "WR One", pos: "WR", value: 80 },
      { id: "wr2", name: "WR Two", pos: "WR", value: 70 },
      { id: "wr3", name: "WR Three", pos: "WR", value: 5 }, // too weak for FLEX
      { id: "wr4", name: "WR Four", pos: "WR", value: 4 }, // too weak for FLEX
      { id: "te1", name: "TE One", pos: "TE", value: 50 },
      { id: "te2", name: "TE Two", pos: "TE", value: 3 }, // too weak for FLEX
    ]);
    // Fixed: 100+90 (QB) + 80+70 (RB) + 80+70 (WR) + 50 (TE) = 540
    // FLEX pool: rb3=60, wr3=5, wr4=4, te2=3 -> best 3 = 60+5+4 = 69
    expect(starterStrength(playerIds, playersById, values)).toBe(540 + 69);
  });

  it("lets a strong 2nd TE win a FLEX slot over weak RB/WR depth", () => {
    const { playerIds, playersById, values } = roster([
      { id: "qb1", name: "QB One", pos: "QB", value: 10 },
      { id: "qb2", name: "QB Two", pos: "QB", value: 10 },
      { id: "rb1", name: "RB One", pos: "RB", value: 10 },
      { id: "rb2", name: "RB Two", pos: "RB", value: 10 },
      { id: "rb3", name: "RB Three", pos: "RB", value: 1 },
      { id: "wr1", name: "WR One", pos: "WR", value: 10 },
      { id: "wr2", name: "WR Two", pos: "WR", value: 10 },
      { id: "wr3", name: "WR Three", pos: "WR", value: 1 },
      { id: "te1", name: "TE One", pos: "TE", value: 10 },
      { id: "te2", name: "TE Two", pos: "TE", value: 40 }, // elite 2nd TE, should flex
    ]);
    // Fixed: 10+10 (QB) + 10+10 (RB) + 10+10 (WR) + 10 (TE) = 70
    // FLEX pool: rb3=1, wr3=1, te2=40 -> best 3 = 40+1+1 = 42
    expect(starterStrength(playerIds, playersById, values)).toBe(70 + 42);
  });

  it("scores an empty or all-unmatched roster as 0", () => {
    expect(starterStrength(null, {}, new Map())).toBe(0);
    const { playerIds, playersById } = roster([{ id: "x", name: "Nobody", pos: "RB", value: 5 }]);
    expect(starterStrength(playerIds, playersById, new Map())).toBe(0);
  });
});
