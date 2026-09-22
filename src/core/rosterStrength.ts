// Roster-strength = the "power ranking" roster factor: for each team, value
// its actual starting lineup by Superflex / TE-premium dynasty value.
//
// The league's real lineup is QB, RB, RB, WR, WR, TE, FLEX, FLEX, FLEX,
// SUPERFLEX (10 starters). SUPERFLEX is modeled as a 2nd QB slot (the
// near-universal correct play in a QB-premium dynasty format). The 3 FLEX
// slots are RB/WR/TE-eligible, so they go to whichever players are actually
// most valuable there, not a fixed split — a team with a strong 3rd RB but
// weak 3rd/4th WRs should get credit for flexing the RB, and vice versa.
//
//   Fixed:  QB top 2, RB top 2, WR top 2, TE top 1
//   Flex:   best 3 remaining among RB/WR/TE (whatever's left after the fixed slots)
//
// Values come from the community "SF TE+" dynasty sheet (KTC-based), the same
// source the league sheet pulls from. Joined to Sleeper by name + position.

// The published "SF TE+" tab (column "Value" = SF TE-premium dynasty value).
const SHEET_ID = "1n5aqip8iFCpltO8deiS7q9m3u_dFvKTZpwzfZXVTpgs";
const SHEET_CSV = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=SF%20TE%2B`;

export const VALID_POSITIONS = ["QB", "RB", "WR", "TE"] as const;
export const FIXED_SLOTS: Record<string, number> = { QB: 2, RB: 2, WR: 2, TE: 1 };
export const FLEX_SLOTS = 3;
export const FLEX_ELIGIBLE = ["RB", "WR", "TE"] as const;

/** name -> value, keyed loosely so Sleeper names join cleanly. */
export type ValueMap = Map<string, number>;

const SUFFIX = /\b(jr|sr|ii|iii|iv|v)\b/g;
export function nameKey(name: string, pos: string): string {
  const n = name.toLowerCase().replace(/[.'-]/g, "").replace(SUFFIX, "").replace(/\s+/g, " ").trim();
  return `${n}|${pos.toUpperCase()}`;
}

// Minimal RFC-4180 CSV parse (gviz quotes every field; fields may contain commas).
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Fetch the SF TE+ value sheet as name|POS -> value. Throws on network/parse failure. */
export async function fetchStarterValues(url = SHEET_CSV): Promise<ValueMap> {
  const res = await fetch(url, { headers: { accept: "text/csv" } });
  if (!res.ok) throw new Error(`SF TE+ sheet -> ${res.status}`);
  const rows = parseCsv(await res.text());
  // Header: <name>, Position Rank, Position, Team, Value, Age, Rookie, ...
  const map: ValueMap = new Map();
  for (let i = 1; i < rows.length; i++) {
    const [name, , pos, , valueStr] = rows[i];
    if (!name || !pos) continue;
    if (!(VALID_POSITIONS as readonly string[]).includes(pos.toUpperCase())) continue; // QB/RB/WR/TE only
    const v = Number(String(valueStr).replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(v) || v <= 0) continue;
    map.set(nameKey(name, pos), v);
  }
  if (map.size < 100) throw new Error(`SF TE+ sheet parsed only ${map.size} players`);
  return map;
}

export interface RosterPlayerMeta { position?: string | null; first_name?: string; last_name?: string; full_name?: string }

/**
 * surname|POS -> candidate nameKeys sharing that surname + position, so a
 * Sleeper short name (e.g. "Chig Okonkwo", "Kenny Gainwell", "Matt Hibner")
 * can still match a sheet row keyed by the player's full first name ("Chigoziem
 * Okonkwo", "Kenneth Gainwell", "Matthew Hibner") without a hardcoded nickname
 * list. Cached per ValueMap so repeated starterStrength() calls (one per
 * roster) don't rebuild it.
 */
const surnameIndexCache = new WeakMap<ValueMap, Map<string, string[]>>();
function surnameIndex(values: ValueMap): Map<string, string[]> {
  let idx = surnameIndexCache.get(values);
  if (idx) return idx;
  idx = new Map();
  for (const key of values.keys()) {
    const [namePart, pos] = key.split("|");
    const surname = namePart.trim().split(" ").pop();
    if (!surname) continue;
    const sk = `${surname}|${pos}`;
    const arr = idx.get(sk) ?? [];
    arr.push(key);
    idx.set(sk, arr);
  }
  surnameIndexCache.set(values, idx);
  return idx;
}

/**
 * A player's sheet value, falling back to an unambiguous surname+position
 * match (exactly one sheet row, same first initial) when the exact name
 * doesn't join — so a first-name/nickname mismatch ("Chig" vs "Chigoziem
 * Okonkwo", "Kenny" vs "Kenneth Gainwell") doesn't silently zero out a real
 * player. The first-initial check matters: without it, "Van Jefferson" would
 * wrongly inherit "Justin Jefferson"'s value merely for sharing a surname +
 * position with the sheet's only Jefferson. Any other ambiguity (two
 * candidates, or a mismatched initial) is deliberately left unmatched (0)
 * rather than guessed at.
 */
function valueFor(nm: string, pos: string, values: ValueMap): number {
  const key = nameKey(nm, pos);
  const exact = values.get(key);
  if (exact != null) return exact;
  const [normName, keyPos] = key.split("|");
  const parts = normName.trim().split(" ");
  const surname = parts[parts.length - 1];
  const firstInitial = parts[0]?.[0];
  if (!surname || !firstInitial) return 0;
  const candidates = surnameIndex(values).get(`${surname}|${keyPos}`);
  if (candidates?.length !== 1) return 0;
  const candFirstInitial = candidates[0].split("|")[0].trim()[0];
  return candFirstInitial === firstInitial ? values.get(candidates[0]) ?? 0 : 0;
}

/** Fixed-slot + best-remaining-FLEX starter-value sum for one roster. Unmatched players score 0. */
export function starterStrength(
  playerIds: string[] | null,
  playersById: Record<string, RosterPlayerMeta>,
  values: ValueMap,
): number {
  if (!playerIds) return 0;
  const byPos: Record<string, number[]> = { QB: [], RB: [], WR: [], TE: [] };
  for (const id of playerIds) {
    const p = playersById[id];
    const pos = (p?.position || "").toUpperCase();
    if (!(pos in byPos)) continue;
    const nm = p?.full_name || `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim();
    byPos[pos].push(valueFor(nm, pos, values));
  }
  for (const pos of Object.keys(byPos)) byPos[pos].sort((a, b) => b - a);

  let total = 0;
  const flexPool: number[] = [];
  for (const [pos, n] of Object.entries(FIXED_SLOTS)) {
    total += byPos[pos].slice(0, n).reduce((a, b) => a + b, 0);
    if ((FLEX_ELIGIBLE as readonly string[]).includes(pos)) flexPool.push(...byPos[pos].slice(n));
  }
  flexPool.sort((a, b) => b - a);
  total += flexPool.slice(0, FLEX_SLOTS).reduce((a, b) => a + b, 0);
  return total;
}
