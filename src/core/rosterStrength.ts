// Roster-strength = the "power ranking" roster factor, reproducing the league
// sheet exactly: for each team, sum the top-N players at each position by
// Superflex / TE-premium value, then rank teams by that sum.
//
//   QB: top 2   RB: top 3   WR: top 4   TE: top 1     (= the SF starting 10)
//
// Values come from the community "SF TE+" dynasty sheet (KTC-based), the same
// source the league sheet pulls from. Joined to Sleeper by name + position.

// The published "SF TE+" tab (column "Value" = SF TE-premium dynasty value).
const SHEET_ID = "1n5aqip8iFCpltO8deiS7q9m3u_dFvKTZpwzfZXVTpgs";
const SHEET_CSV = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=SF%20TE%2B`;

export const STARTER_SLOTS: Record<string, number> = { QB: 2, RB: 3, WR: 4, TE: 1 };

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
    if (!(pos.toUpperCase() in STARTER_SLOTS)) continue; // QB/RB/WR/TE only
    const v = Number(String(valueStr).replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(v) || v <= 0) continue;
    map.set(nameKey(name, pos), v);
  }
  if (map.size < 100) throw new Error(`SF TE+ sheet parsed only ${map.size} players`);
  return map;
}

export interface RosterPlayerMeta { position?: string | null; first_name?: string; last_name?: string; full_name?: string }

/** Top-N-per-position starter-value sum for one roster. Unmatched players score 0. */
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
    byPos[pos].push(values.get(nameKey(nm, pos)) ?? 0);
  }
  let total = 0;
  for (const [pos, n] of Object.entries(STARTER_SLOTS)) {
    total += byPos[pos].sort((a, b) => b - a).slice(0, n).reduce((a, b) => a + b, 0);
  }
  return total;
}
