# Weekly External-Context Research Prompt

You are researching possible cultural references for a private dynasty fantasy-football recap published on {{PUBLICATION_DATE}}.

Only consider events that occurred, became public, or were meaningfully trending between:

{{CONTEXT_START_DATE}} and {{CONTEXT_END_DATE}}

Do not use hindsight from events or trends that became prominent after the end date.

## Goal

Return 5 to 8 factual candidate events that a separate satire writer could potentially connect to the fantasy-league data.

You are not writing the recap.

You are not trying to force jokes.

## Prioritize

- notable NFL stories and unusual performances
- other major sports moments
- funny or unusual sports stories
- college sports
- internet memes/trends demonstrably active during the date range
- pop culture
- entertainment
- celebrity news
- harmless bizarre news
- broadly recognizable cultural moments

Audience context: American men in their 20s who follow football, sports, and internet culture.

Favor references this audience might plausibly recognize.

Do not manufacture "fratty" relevance.

## Date discipline

An event must fit the exact date window.

A meme that became huge two weeks later is not a high-confidence candidate merely because its origin technically predates publication.

When relevant, distinguish:
- originated during this period
- began spreading during this period
- was already broadly recognizable during this period

Use `recognizability` to capture this.

## Exclusions

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

Sports injuries may be included only as neutral football context when relevant, not because injury itself is funny.

## Output

Return structured JSON matching `research-output-schema.json`.

For every candidate include:
- stable ID
- event date
- category
- one-sentence factual description
- why it might offer useful comedy material
- recognizability: high / medium / niche
- source title
- source URL

Every candidate must have a credible supporting source.

Do not write fantasy recap prose.

Do not invent a league connection. The writer will decide whether one exists.
