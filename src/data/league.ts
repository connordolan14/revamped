// League identity + season fixtures. The 2025 season is complete; its final
// standings are taken verbatim from Connor's sheet (authoritative), and weekly
// scores drive the heatmap / consistency views. Live seasons are computed from
// Sleeper by the pipeline instead of hardcoded here.

export const LEAGUE = {
  name: "Revamped League",
  currentLeagueId: "1312251123628789760",
  season: "2026",
  numTeams: 12,
  playoffTeams: 6,
  playoffWeekStart: 15,
  regularSeasonWeeks: 14,
  topBonusCount: 6, // top 6 scorers earn +0.5 each week
  rosterPositions: ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "FLEX", "FLEX", "SUPER_FLEX"],
  benchSlots: 15,
  taxiSlots: 3,
  scoring: {
    rec: 0.5, bonusRecTE: 0.25, passTd: 4, passYd: 0.04, rushRecYd: 0.1,
    passInt: -1, fumLost: -2, sixPointPassTd: true,
  },
  sleeperUrl: "https://sleeper.com/leagues/1312251123628789760",
};

export interface Team {
  rosterId: number;
  ownerId: string;
  handle: string;
  teamName: string;
}

// roster_id ↔ owner ↔ names (from Sleeper users/rosters, 2026).
export const TEAMS: Team[] = [
  { rosterId: 1, ownerId: "989751443903025152", handle: "dackerly36", teamName: "The Permanent Rebuild" },
  { rosterId: 2, ownerId: "989607777175674880", handle: "Hank1517", teamName: "Jayden's Blue Balls" },
  { rosterId: 3, ownerId: "988181717380820992", handle: "greenie0513", teamName: "Green Egbukas & Ham" },
  { rosterId: 4, ownerId: "957435781254746112", handle: "TheBearJew44", teamName: "Jerking Goff" },
  { rosterId: 5, ownerId: "895437361486491648", handle: "mhaanders", teamName: "Injured Reserve" },
  { rosterId: 6, ownerId: "989602386832314368", handle: "dball11", teamName: "Woodys Toy Box" },
  { rosterId: 7, ownerId: "989626395162636288", handle: "ryanog", teamName: "New York Mudbones" },
  { rosterId: 8, ownerId: "989623752923086848", handle: "connordolan14", teamName: "New England Keys" },
  { rosterId: 9, ownerId: "1136007372641792000", handle: "jtyurconic2", teamName: "Team jtyurconic2" },
  { rosterId: 10, ownerId: "475339773154684928", handle: "chrisrenna17", teamName: "Team chrisrenna17" },
  { rosterId: 11, ownerId: "1256365186739081216", handle: "jbitterman99", teamName: "Mark 2.0" },
  { rosterId: 12, ownerId: "989606956224544768", handle: "BrendanBall03", teamName: "Team BrendanBall03" },
];

// Team avatar URLs (Sleeper), keyed by ownerId. Prefer custom uploads.
export const AVATARS: Record<string, string> = {
  "475339773154684928": "https://sleepercdn.com/avatars/thumbs/8eb8f8bf999945d523f2c4033f70473e",
  "895437361486491648": "https://sleepercdn.com/uploads/b96fe5c50d5a9a7b77fd7d1d5aaabb29.jpg",
  "957435781254746112": "https://sleepercdn.com/uploads/713fd0bf3192c83a47258d0eeb99f470.jpg",
  "988181717380820992": "https://sleepercdn.com/uploads/9e2f9fff6c08474919f2fb59f1434e13.jpg",
  "989602386832314368": "https://sleepercdn.com/uploads/90e3b6806d084926468c249b761ff5b1.jpg",
  "989606956224544768": "https://sleepercdn.com/avatars/thumbs/f0edbf4278f53f9425db175073df6584",
  "989607777175674880": "https://sleepercdn.com/avatars/thumbs/e7af4deab0289b4f5505646424895246",
  "989623752923086848": "https://sleepercdn.com/uploads/febdfaa6950f7c1b7ec1076b88170a20",
  "989626395162636288": "https://sleepercdn.com/uploads/bbe87db28f3084a8e92c6a8e763f10fb.jpg",
  "989751443903025152": "https://sleepercdn.com/avatars/thumbs/15d7cf259bc30eab8f6120f45f652fb6",
  "1136007372641792000": "https://sleepercdn.com/avatars/thumbs/f0edbf4278f53f9425db175073df6584",
  "1256365186739081216": "https://sleepercdn.com/uploads/ceb696ccabf2f9311f60c14c3c6e5d4f.jpg",
};

export const handleToRoster = new Map(TEAMS.map((t) => [t.handle, t.rosterId]));
export const teamByRoster = new Map(TEAMS.map((t) => [t.rosterId, t]));

// Weekly scores, 2025 regular season (weeks 1..14), keyed by handle.
export const SCORES_2025: Record<string, number[]> = {
  dackerly36: [100.82,92.65,99.22,108.98,73.76,61.93,49.83,70.65,117.32,92.37,74.02,61.99,59.21,75.36],
  Hank1517: [134.78,94.82,125.39,106.12,147.11,116.49,137.90,129.32,95.94,124.37,75.24,72.50,118.99,92.28],
  greenie0513: [116.51,125.17,103.42,113.51,139.37,76.52,163.26,99.91,161.42,102.05,84.29,113.10,107.38,126.84],
  TheBearJew44: [95.77,187.61,127.64,133.77,157.92,113.22,92.69,99.35,127.01,131.00,114.15,100.21,113.39,111.41],
  mhaanders: [125.80,105.33,117.48,139.55,166.03,123.44,95.06,84.19,96.55,114.63,139.61,67.08,96.62,70.86],
  dball11: [103.10,101.43,132.48,120.57,131.83,114.53,111.05,118.98,95.81,126.77,100.52,97.17,128.95,118.74],
  ryanog: [134.38,162.64,101.00,136.29,148.93,155.17,128.81,105.12,160.20,120.89,149.53,160.70,115.15,131.22],
  connordolan14: [113.34,137.92,124.45,135.63,129.26,75.94,146.01,160.59,105.95,123.19,114.56,117.49,127.05,157.27],
  jtyurconic2: [143.89,106.67,162.23,121.64,91.64,116.56,99.43,154.22,147.68,106.26,145.35,133.22,146.72,134.23],
  chrisrenna17: [108.51,142.64,99.51,171.91,109.26,152.12,131.60,107.00,145.67,135.98,126.94,148.11,118.33,108.64],
  jbitterman99: [120.27,104.29,84.89,109.26,145.52,139.24,154.22,129.63,154.60,81.85,98.65,122.75,149.03,117.76],
  BrendanBall03: [105.74,111.60,132.29,141.45,115.16,100.24,80.73,118.75,107.12,80.79,106.91,97.83,91.72,111.96],
};

// Final 2025 standings, verbatim from the league sheet (authoritative).
export interface FinalStanding {
  handle: string; wins: number; losses: number; winPct: number;
  h2hW: number; h2hL: number; pf: number; pa: number; streak: string;
}
export const STANDINGS_2025_FINAL: FinalStanding[] = [
  { handle: "ryanog", wins: 16.5, losses: 4.5, winPct: 0.550, h2hW: 11, h2hL: 3, pf: 1910.03, pa: 1543.94, streak: "W1" },
  { handle: "connordolan14", wins: 15, losses: 6, winPct: 0.500, h2hW: 10, h2hL: 4, pf: 1768.65, pa: 1481.78, streak: "L1" },
  { handle: "jtyurconic2", wins: 14.5, losses: 6.5, winPct: 0.483, h2hW: 10, h2hL: 4, pf: 1809.74, pa: 1707.34, streak: "W1" },
  { handle: "chrisrenna17", wins: 12.5, losses: 8.5, winPct: 0.417, h2hW: 8, h2hL: 6, pf: 1806.22, pa: 1739.52, streak: "W1" },
  { handle: "jbitterman99", wins: 12.5, losses: 8.5, winPct: 0.417, h2hW: 8, h2hL: 6, pf: 1711.96, pa: 1577.41, streak: "W1" },
  { handle: "dball11", wins: 10.5, losses: 10.5, winPct: 0.350, h2hW: 8, h2hL: 6, pf: 1601.93, pa: 1507.17, streak: "L1" },
  { handle: "Hank1517", wins: 10, losses: 11, winPct: 0.333, h2hW: 6, h2hL: 8, pf: 1571.25, pa: 1633.27, streak: "W1" },
  { handle: "mhaanders", wins: 9.5, losses: 11.5, winPct: 0.317, h2hW: 7, h2hL: 7, pf: 1542.23, pa: 1700.14, streak: "W1" },
  { handle: "TheBearJew44", wins: 8.5, losses: 12.5, winPct: 0.283, h2hW: 5, h2hL: 9, pf: 1705.14, pa: 1736.47, streak: "L1" },
  { handle: "greenie0513", wins: 8.5, losses: 12.5, winPct: 0.283, h2hW: 5, h2hL: 9, pf: 1632.75, pa: 1592.27, streak: "L1" },
  { handle: "BrendanBall03", wins: 8, losses: 13, winPct: 0.267, h2hW: 6, h2hL: 8, pf: 1502.29, pa: 1680.63, streak: "L1" },
  { handle: "dackerly36", wins: 0, losses: 21, winPct: 0.000, h2hW: 0, h2hL: 14, pf: 1138.11, pa: 1800.36, streak: "L1" },
];
