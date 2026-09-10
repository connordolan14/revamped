# Weekly Recap Data Contract

This document defines the boundary between deterministic league logic and generated editorial writing.

## Principle

If a value can be calculated reliably by code, calculate it in code.

The writer should never be responsible for reconstructing standings, interpreting Sleeper roster IDs, resolving player IDs, calculating legal lineup substitutions, or deciding whether a transaction happened before kickoff.

## Authoritative source hierarchy

1. Existing site's own stats/history engine
2. Sleeper primary API data
3. Existing player metadata/value feeds already used by the site
4. Derived recap calculations
5. Model interpretation only after the above are fixed

The model is never an authoritative factual source for league statistics.

## Core top-level object

Recommended shape:

```json
{
  "season": 2025,
  "week": 8,
  "publication_date": "2025-10-28",
  "context_window": {
    "start": "2025-10-21",
    "end": "2025-10-27"
  },
  "league": {},
  "teams": [],
  "matchups": [],
  "league_week_facts": {},
  "transactions": [],
  "story_candidates": [],
  "recent_recap_memory": {}
}
```

## League metadata

Include:
- league name
- number of teams
- playoff spots
- bye spots
- regular-season length
- scoring-format description only if needed
- weekly cutline
- weeks remaining

## Team identity

Every team object should expose both:

```json
{
  "roster_id": 8,
  "team_name": "New England Keys",
  "username": "connordolan14"
}
```

Rules:
- do not infer real owner names
- preserve the exact current/historical team name applicable to that week if the site stores historical names
- if no team name exists, username is the display fallback

## Matchup object

Recommended fields:

```json
{
  "matchup_id": 1,
  "team_a": {},
  "team_b": {},
  "winner_roster_id": 8,
  "loser_roster_id": 5,
  "winner_score": 160.59,
  "loser_score": 84.19,
  "margin": 76.4
}
```

Each team-side object should support:
- roster_id
- team_name
- username
- score
- weekly_score_rank
- h2h_record_before
- h2h_record_after
- standings_position_before
- standings_position_after
- power_rank_before
- power_rank_after
- power_rank_delta
- all_play_wins_week
- all_play_losses_week
- cutline_delta
- made_top_six
- active_h2h_streak_before/after
- playoff_position_before/after
- bye_position_before/after
- top starter performances
- notable bench performances
- optimal/legal lineup context where available

Nullable fields are acceptable when the existing engine cannot calculate a historical value reliably.

Do not invent missing historical data.

## Derived-value sources

| Derived value | Authoritative calculation |
|---|---|
| matchup score | Sleeper matchup API / existing normalized score |
| winner | compare final matchup scores |
| margin | winner score minus loser score |
| weekly scoring rank | rank all 12 team scores descending |
| top-six cutline | sixth-highest final team score |
| cutline delta | team score minus cutline |
| weekly all-play record | compare team score with each of other 11 scores |
| H2H record before | existing stats engine through week N-1 |
| H2H record after | existing stats engine through week N |
| standings before/after | existing standings engine as of week N-1/N |
| power before/after | existing six-factor power engine as of week N-1/N |
| streak before/after | existing history engine |
| H2H history | existing historical matchup engine |
| player weekly score | Sleeper weekly matchup/player scoring |
| starter/bench status | Sleeper starters list vs roster players |
| transaction timing | Sleeper transaction timestamp |
| FAAB | Sleeper transaction settings |
| same-week acquisition | transaction timestamp/week + roster membership |
| legal lineup regret | lineup eligibility calculation in code |
| league/franchise records | existing historical engine or deterministic historical query |

## Story candidates

Recommended shape:

```json
{
  "fact_id": "2025-w08-matchup-keys-ir-margin",
  "type": "blowout",
  "importance_score": 9.4,
  "summary": "New England Keys beat Injured Reserve by 76.40.",
  "support": {
    "winner_roster_id": 8,
    "loser_roster_id": 5,
    "margin": 76.4
  }
}
```

Suggested candidate scoring inputs:
- percentile/extremity within current week
- percentile/extremity in league history
- direct standings/playoff impact
- streak impact
- lineup-decision consequence
- transaction connection
- rivalry/history connection
- multi-fact coincidence
- whether another candidate already covers the same underlying event

Do not make the importance formula overly complicated in v1. It is an editorial aid, not a new power-ranking model.

## Starter performances

Do not send every player's score unless there is a reason.

Recommended:
- top 2–3 starters per team
- especially poor starters if unusually relevant
- player involved in external NFL context
- player involved in recent transaction/trade context

Shape:

```json
{
  "player_id": "6813",
  "name": "Jonathan Taylor",
  "position": "RB",
  "points": 36.4,
  "started": true
}
```

## Bench context

Recommended:

```json
{
  "player_id": "6768",
  "name": "Tua Tagovailoa",
  "points": 24.2,
  "position": "QB",
  "started": false,
  "highest_bench_score_team": true,
  "highest_bench_score_league": true,
  "legal_swap_available": true,
  "best_legal_replacement_for": "player-id",
  "net_points_if_swapped": 19.9,
  "changes_h2h_result": false,
  "changes_top_six_result": false
}
```

Never call something a lineup mistake unless there was a legal/realistic substitution.

## Transactions

Recommended:

```json
{
  "transaction_id": "...",
  "type": "free_agent",
  "roster_id": 8,
  "team_name": "New England Keys",
  "created_at": "...",
  "display_timing": "Saturday",
  "adds": [
    {
      "player_id": "7083",
      "name": "Tyler Huntley"
    }
  ],
  "drops": [],
  "faab_spent": 0,
  "same_week_start": true,
  "same_week_points": 16.74
}
```

Resolve player names before writer input.

## Recent trades

When available, normalize:
- trade date/week
- participating teams
- players/picks exchanged
- current-week scores of traded players
- whether traded player faced former roster
- whether current-week matchup creates a revenge/story angle

Avoid declaring a permanent trade winner in deterministic data. Supply facts.

## Historical facts

Useful historical objects should state scope explicitly:

```json
{
  "fact_id": "2025-w08-franchise-low-...",
  "scope": "franchise",
  "record_type": "lowest_weekly_score",
  "is_record": true,
  "rank_in_history": 1,
  "comparison_value": 70.65
}
```

Do not tell the writer something is a league record unless code proves it.

## Recent recap context

Recommended compact shape:

```json
{
  "lookback_weeks": [5, 6, 7],
  "team_bits": [],
  "external_references": [],
  "opening_mechanisms": [],
  "ending_mechanisms": [],
  "phrases_to_avoid_repeating": []
}
```

## Unknown or unavailable values

Use null/empty collections.

Do not:
- guess
- have the writer infer missing standings
- silently use end-of-season values for a historical week
- confuse H2H-only record with the league's total standings result

Historical-as-of-week correctness is more important than completeness.
