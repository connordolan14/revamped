// Portable Sleeper API client (read-only, no auth). Uses global fetch, so it
// runs unchanged in Node (GitHub Action) and the browser (live in-week reads).

const BASE = "https://api.sleeper.app/v1";

export interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  status: string;
  previous_league_id: string | null;
  settings: Record<string, number>;
  scoring_settings: Record<string, number>;
  roster_positions: string[];
  total_rosters: number;
  metadata?: Record<string, string>;
  avatar?: string | null;
}

export interface SleeperUser {
  user_id: string;
  display_name: string;
  avatar: string | null;
  metadata?: { team_name?: string; avatar?: string } & Record<string, string>;
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string | null;
  players: string[] | null;
  starters: string[] | null;
  reserve: string[] | null;
  taxi: string[] | null;
  settings: {
    wins: number; losses: number; ties: number;
    fpts: number; fpts_decimal?: number;
    fpts_against?: number; fpts_against_decimal?: number;
  } & Record<string, number>;
}

export interface SleeperMatchup {
  roster_id: number;
  matchup_id: number | null;
  points: number;
  starters: string[] | null;
  players: string[] | null;
  starters_points?: number[];
  players_points?: Record<string, number>;
}

export interface SleeperTransaction {
  transaction_id: string;
  type: string; // "trade" | "waiver" | "free_agent" | "commissioner"
  status: string;
  created: number;
  roster_ids: number[];
  adds: Record<string, number> | null; // player_id -> roster_id
  drops: Record<string, number> | null;
  draft_picks: any[];
  waiver_budget: { sender: number; receiver: number; amount: number }[];
  settings?: { waiver_bid?: number } | null;
}

export interface NflState {
  week: number;
  season: string;
  season_type: string;
  display_week?: number;
  leg?: number;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Sleeper ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

export const sleeper = {
  league: (id: string) => get<SleeperLeague>(`/league/${id}`),
  users: (id: string) => get<SleeperUser[]>(`/league/${id}/users`),
  rosters: (id: string) => get<SleeperRoster[]>(`/league/${id}/rosters`),
  matchups: (id: string, week: number) => get<SleeperMatchup[]>(`/league/${id}/matchups/${week}`),
  transactions: (id: string, week: number) => get<SleeperTransaction[]>(`/league/${id}/transactions/${week}`),
  tradedPicks: (id: string) => get<any[]>(`/league/${id}/traded_picks`),
  state: () => get<NflState>(`/state/nfl`),
  playersNfl: () => get<Record<string, any>>(`/players/nfl`),
  avatarUrl: (id: string | null | undefined, thumb = true) =>
    id ? `https://sleepercdn.com/avatars/${thumb ? "thumbs/" : ""}${id}` : null,
};

/** Walk previous_league_id back to the first season. Returns oldest→newest. */
export async function fetchLeagueChain(currentId: string): Promise<SleeperLeague[]> {
  const chain: SleeperLeague[] = [];
  let id: string | null = currentId;
  const seen = new Set<string>();
  while (id && !seen.has(id)) {
    seen.add(id);
    const lg = await sleeper.league(id);
    chain.push(lg);
    id = lg.previous_league_id;
  }
  return chain.reverse();
}
