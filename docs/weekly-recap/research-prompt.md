# Weekly External-Context Research Prompt

You are researching real-world context for a private dynasty fantasy-football recap published on {{PUBLICATION_DATE}}.

Only consider events that occurred, became public, or were meaningfully trending between:

{{CONTEXT_START_DATE}} and {{CONTEXT_END_DATE}}

Do not use hindsight from events or trends that became prominent after the end date.

You are not writing the recap. You are not trying to force jokes.

There are two research tasks. Do both. Tier one is the larger and more important one.

## Tier one: real NFL context for every notable player already in WEEK_DATA (primary task)

Open that week's recap context file (`data/recaps/context/<season>-week-<NN>.json`) and read `context.players`: `topStarters`, `highestBench`, `benchBlunders`, and `lineupRegret`, plus any player named in a high-importance entry in `context.facts`.

For every one of those players, research their actual real-world game that week:

- final stat line (yardage, touchdowns, targets/carries, completions, etc., as position-appropriate)
- any real milestone: first to do X, most since year Y, passed a named player on an all-time list, career high
- advanced/box-score detail when available and notable: yards before/after contact, snap share, target share, air yards
- injury or in-game departure, stated neutrally, never as comedy
- the real final score and context of their actual NFL game

This is not optional. A week where WEEK_DATA surfaces six notable player performances should produce six tier-one candidates, one per player, not a token one or two. Category for every tier-one candidate is exactly `"NFL"` (case-sensitive-insensitive match, but write it as `NFL`) — this is what tells the writer and the validator these are uncapped.

If a real, credible stat line cannot be found for a named player (obscure box score, paywalled data), say so by simply omitting that candidate rather than guessing or approximating.

## Tier two: broader cultural moments (secondary task, small)

Return roughly 3 to 5 additional candidate events, only loosely tied to the league if at all, from the same date window. These exist so the writer has zero-to-two available if a genuinely good connection appears — most weeks will use none or one.

Prioritize:

- other major sports moments
- funny or unusual sports stories
- college sports
- internet memes/trends demonstrably active during the date range
- pop culture, entertainment, celebrity news
- harmless bizarre news
- broadly recognizable cultural moments

Audience context: American men in their 20s who follow football, sports, and internet culture. Favor references this audience might plausibly recognize. Do not manufacture "fratty" relevance.

Category for every tier-two candidate must be something other than `NFL` (e.g. `Pop Culture`, `Other Sports`, `Internet`, `College Sports`, `News`) — this is what caps them at two in the writer's hands.

## Date discipline (both tiers)

An event must fit the exact date window.

A meme that became huge two weeks later is not a high-confidence candidate merely because its origin technically predates publication.

When relevant, distinguish:
- originated during this period
- began spreading during this period
- was already broadly recognizable during this period

Use `recognizability` to capture this.

## Exclusions (both tiers)

Do not include as comedy candidates:
- death
- serious illness
- violent crime
- mass casualty events
- war
- terrorism
- natural disasters
- sexual assault
- humanitarian crises
- other sensitive tragedy

Sports injuries may be included only as neutral football context when relevant (tier one requires this whenever a rostered player was hurt), not because injury itself is funny.

## Output

Return structured JSON matching `research-output-schema.json`. Tier one and tier two candidates go in the same `candidates` array; category is what distinguishes them.

For every candidate include:
- stable ID
- event date
- category (`NFL` for tier one; anything else for tier two)
- one-sentence factual description
- why it might offer useful comedy material
- recognizability: high / medium / niche
- source title
- source URL

Every candidate must have a credible supporting source.

Do not write fantasy recap prose.

Do not invent a league connection. The writer will decide whether one exists.
