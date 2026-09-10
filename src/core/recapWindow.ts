// Publication date and external-research context window for a fantasy week.
//
// A fantasy week's games run Thursday through Monday night. The recap publishes
// the following Tuesday morning, and the research stage looks at the exact
// Tuesday-through-Monday period that ended the night before.
//
// Anchored on the 2025 Week 8 fixture: publication 2025-10-28 (Tuesday),
// window 2025-10-21 (Tuesday) through 2025-10-27 (Monday).
//
// All arithmetic is in UTC on date-only values, so it cannot drift with the
// machine's timezone or with daylight saving.

export interface RecapWindow {
  /** Tuesday the recap publishes, ISO date. */
  publicationDate: string;
  /** Inclusive Tuesday..Monday range the research stage may draw on. */
  contextWindow: { start: string; end: string };
}

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The Tuesday on or after `d`. */
function nextOrSameTuesday(d: Date): Date {
  // getUTCDay: Sun 0 ... Tue 2 ... Sat 6
  const delta = (2 - d.getUTCDay() + 7) % 7;
  return new Date(d.getTime() + delta * DAY);
}

/**
 * Derive the window from the date the week's last game finished (or any date
 * within the week's Monday-night-or-earlier tail).
 */
export function windowFromWeekEnd(lastGameDate: string | Date): RecapWindow {
  const end = typeof lastGameDate === "string" ? new Date(`${lastGameDate}T00:00:00Z`) : lastGameDate;
  const publication = nextOrSameTuesday(new Date(end.getTime() + DAY));
  return windowFromPublication(publication);
}

/** Derive the window from the Tuesday publication date. */
export function windowFromPublication(publication: string | Date): RecapWindow {
  const pub = typeof publication === "string" ? new Date(`${publication}T00:00:00Z`) : publication;
  const start = new Date(pub.getTime() - 7 * DAY); // previous Tuesday
  const end = new Date(pub.getTime() - DAY);       // the Monday just gone
  return { publicationDate: iso(pub), contextWindow: { start: iso(start), end: iso(end) } };
}

/**
 * Derive the window from the NFL season's kickoff date and a week number.
 *
 * Week 1 is the week containing kickoff; each later week starts 7 days on. The
 * week's Monday night is 4 days after its Thursday, so publication is the
 * Tuesday after that.
 */
/**
 * The Thursday the NFL season opens: the Thursday after the first Monday in
 * September (Labor Day). Derived per season rather than read from Sleeper,
 * whose `season_start_date` describes only the current season and so would
 * silently produce the wrong year for a historical week.
 */
export function nflSeasonStart(season: string | number): string {
  const y = Number(season);
  const sept1 = new Date(Date.UTC(y, 8, 1));
  const firstMonday = new Date(sept1.getTime() + ((1 - sept1.getUTCDay() + 7) % 7) * DAY);
  return iso(new Date(firstMonday.getTime() + 3 * DAY));
}

/** Window for a season + week, using that season's own opening Thursday. */
export function windowForSeasonWeek(season: string | number, week: number): RecapWindow {
  return windowForWeek(nflSeasonStart(season), week);
}

export function windowForWeek(seasonStartDate: string, week: number): RecapWindow {
  const kickoff = new Date(`${seasonStartDate}T00:00:00Z`);
  // The Thursday that opens the requested week.
  const thursdayOfWeek1 = new Date(kickoff.getTime() + ((4 - kickoff.getUTCDay() + 7) % 7) * DAY);
  const thursday = new Date(thursdayOfWeek1.getTime() + (week - 1) * 7 * DAY);
  const mondayNight = new Date(thursday.getTime() + 4 * DAY);
  return windowFromWeekEnd(mondayNight);
}
