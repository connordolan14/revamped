// FantasyCalc dynasty values client. Free, no auth. Tuned to this league:
// superflex (2 QB), 12 teams, 0.5 PPR, dynasty. Keyed by Sleeper player_id so
// it joins directly to Sleeper rosters.

const FC_BASE = "https://api.fantasycalc.com/values/current";

export interface FcPlayer {
  id: number;
  name: string;
  mflId?: string;
  sleeperId?: string;
  position: string;
  maybeTeam?: string | null;
  maybeAge?: number | null;
  maybeYoe?: number | null; // years of experience
}

export interface FcValue {
  player: FcPlayer;
  value: number;
  overallRank: number;
  positionRank: number;
  trend30Day?: number;
  redraftValue?: number;
  combinedValue?: number;
}

export interface PlayerValue {
  sleeperId: string;
  name: string;
  position: string;
  team: string | null;
  age: number | null;
  value: number;
  overallRank: number;
  positionRank: number;
  trend30Day: number;
}

export async function fetchDynastyValues(opts?: {
  isDynasty?: boolean; numQbs?: number; numTeams?: number; ppr?: number;
}): Promise<PlayerValue[]> {
  const p = new URLSearchParams({
    isDynasty: String(opts?.isDynasty ?? true),
    numQbs: String(opts?.numQbs ?? 2),
    numTeams: String(opts?.numTeams ?? 12),
    ppr: String(opts?.ppr ?? 0.5),
  });
  const res = await fetch(`${FC_BASE}?${p.toString()}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`FantasyCalc -> ${res.status}`);
  const raw = (await res.json()) as FcValue[];
  const out: PlayerValue[] = [];
  for (const r of raw) {
    if (!r.player?.sleeperId) continue; // only keep players we can join to Sleeper
    out.push({
      sleeperId: r.player.sleeperId,
      name: r.player.name,
      position: r.player.position,
      team: r.player.maybeTeam ?? null,
      age: r.player.maybeAge ?? null,
      value: r.value,
      overallRank: r.overallRank,
      positionRank: r.positionRank,
      trend30Day: r.trend30Day ?? 0,
    });
  }
  return out;
}

/** Sum of dynasty values for a roster's players — feeds the power-model roster factor. */
export function rosterValue(
  playerIds: string[] | null,
  values: Map<string, PlayerValue>,
): number {
  if (!playerIds) return 0;
  let total = 0;
  for (const id of playerIds) total += values.get(id)?.value ?? 0;
  return total;
}
