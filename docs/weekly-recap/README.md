# Revamped League Weekly Recap

## Objective

Replace the site's deterministic fill-in-the-blank weekly recap with a generated editorial recap published as part of the normal Tuesday site refresh.

The rest of the website remains deterministic. The recap is the one intentionally generated editorial feature.

This is a static site. There is no database and this feature must not introduce a runtime backend.

The existing build process pulls league data, calculates site statistics, and writes the JSON consumed by the frontend. The weekly recap should fit into that architecture rather than creating a separate application or service.

## Core design principle

The language model writes. The site's own engine calculates.

Anything the site can calculate deterministically should be calculated before the writer sees the data.

Do not send a raw Sleeper dump to the writer and ask it to discover the league.

## Desired pipeline

Sleeper/source data  
→ deterministic recap-context builder  
→ deterministic story candidates  
→ external-context research  
→ recap writer  
→ editor/quality-control pass  
→ deterministic validator  
→ persisted recap  
→ normal site JSON/rendering

Each stage should have a narrow responsibility.

## Stage 1: deterministic recap context

Implement a function/module that converts existing league data into a normalized weekly recap context.

Reuse the site's existing stats engine wherever possible.

The writer-facing context should contain resolved names and useful derived facts. It should not require the writer to understand Sleeper player IDs, roster IDs, transaction internals, or historical reconstruction logic.

At minimum support:

- matchup participants and final scores
- winner and margin
- team name and username
- weekly score rank
- H2H record before and after the week
- standings position before and after, if already available from the engine
- power ranking before and after
- top-six cutline and each team's distance from it
- weekly all-play record/rank
- meaningful active streaks
- playoff and bye-position movement
- H2H history when available
- notable starter performances
- notable bench performances
- legal/realistic lineup-regret calculations when available
- transactions and FAAB
- transaction timing
- recently added players and same-week performance
- recent trade context
- league/franchise records or oddities
- candidate story facts with stable fact IDs

## Stable fact IDs

Every story-worthy deterministic observation should have a stable `fact_id`.

Examples:

- `2025-w08-matchup-keys-ir-margin`
- `2025-w08-team-permanent-rebuild-score`
- `2025-w08-bench-chrisrenna17-tua`
- `2025-w08-add-keys-huntley`
- `2025-w08-cutline-brendan-exact`
- `2025-w08-all-winners-top-six`

Fact IDs let the writer/editor report which facts were used and allow the code to detect obvious body/footer duplication.

Do not expose fact IDs in the rendered site.

## Stage 2: deterministic story candidates

The code should calculate candidate observations before writing.

This is not meant to fully choose the article. It gives the writer a ranked editorial menu.

Candidate categories may include:

- blowout
- close game
- high-scoring loss
- low-scoring win
- weekly high/low
- league/franchise scoring record
- near record
- narrow top-six miss/escape
- exact cutline
- all-play injustice/luck
- winning/losing streak
- streak ending
- playoff entry/exit
- bye entry/exit
- power jump/drop
- rivalry/history
- lineup regret
- bench anomaly
- waiver payoff
- FAAB miss
- recently dropped player explosion
- trade revenge
- recently acquired player affecting matchup
- strange numerical coincidence
- multiple contenders losing
- multiple bottom teams winning

Each candidate should have:
- `fact_id`
- `type`
- `importance_score`
- `summary`
- machine-readable supporting fields where useful

Importance scoring should be deterministic and transparent enough to debug, but the writer remains free to ignore a high-ranked candidate if several facts combine into a better story.

## Stage 3: external-context research

Run a separate model request whose only job is finding useful NFL, sports, pop-culture, internet-culture, entertainment, celebrity, or harmless unusual-news events from the exact Tuesday-through-Monday period associated with that fantasy week.

The research stage may use web search.

It returns structured candidates only.

The writer may use zero, one, or at most two.

The writer should never have to browse the web itself.

If external research fails, the system should normally continue with an empty context packet rather than fail the recap entirely.

## Stage 4: writer

Load the permanent writer prompt from one source-of-truth file.

Pass:
- normalized `WEEK_DATA`
- curated `EXTERNAL_CONTEXT`
- `RECENT_RECAP_CONTEXT`

Use structured model output.

The writer should return:
- title
- body paragraphs
- "For the record" items
- fact IDs used in the body
- fact IDs associated with footer items
- external-context IDs used
- compact team/running-bit metadata for future recap memory

The frontend only renders title/body/footer text.

## Stage 5: editor

The initial writer output is not automatically publishable.

Run a second editorial pass using `editor-prompt.md`.

The editor receives:
- draft
- normalized week data
- external context
- recent recap context
- relevant permanent style constraints

Its job is to fix problems, not rewrite strong prose gratuitously.

## Stage 6: deterministic validation

Validate after the editor.

Do not trust the model to enforce rules that code can enforce.

Validation should include:
- JSON schema
- body word-count range
- footer item count
- no em dash
- no compact numeric score notation such as `129.63-99.35`
- no unknown fact IDs
- no unknown external-context IDs
- max two external references
- banned phrases
- body/footer fact-ID duplication
- title presence
- non-empty body paragraphs

Where feasible, validate team/user/player references against supplied context.

## Publication and idempotency

A completed recap should normally be generated exactly once.

The daily build must not regenerate a valid old recap.

Pseudo-behavior:

```
if week is complete:
    if persisted recap exists and is valid:
        reuse it
    else:
        generate → edit → validate → persist
```

Provide a developer override such as:

`--generate-recap 8`
`--force-recap 8`

Use the command style already used by the repository.

## Source hashes and stat corrections

Store a deterministic source-data hash with each recap.

If source data later changes:
- preserve the already-published recap
- log/surface the changed source hash
- do not silently regenerate
- allow explicit manual regeneration

## Persistence

Do not introduce a database.

During repository inspection, determine the existing persistent mechanism.

Acceptable patterns include:
- checked-in static JSON
- persistent generated-data directory
- deployment artifact store already used by the project
- another existing static persistence convention

The recap must survive later scheduled builds.

## Recent recap memory

Build compact recent context from persisted recap metadata.

Prefer the previous 2 to 4 weeks plus active longer-running storylines.

Track enough to avoid:
- same joke about same team
- same fake-expert setup
- same opening mechanism
- same ending
- same cultural reference
- repeated phrase
- repeated transaction/rivalry framing

Example metadata:

```json
{
  "team_bits": [
    {
      "team": "The Permanent Rebuild",
      "week": 8,
      "theme": "0-8 losing/rebuild joke"
    }
  ],
  "external_references": [
    "Katy Perry / Justin Trudeau"
  ],
  "opening_mechanism": "external parallel",
  "ending_mechanism": "dry callback"
}
```

Do not send the entire season of prose unless needed.

## Frontend

Preserve the existing week dropdown.

Render:
- title
- body paragraphs
- "For the record"

Do not expose:
- model IDs
- fact IDs
- prompts
- citations/research metadata
- generation diagnostics

Do not redesign unrelated homepage sections.

## Failure behavior

A generation failure should not destroy a valid site build.

Never overwrite a valid persisted recap with:
- malformed output
- failed research
- failed editor response
- validator failure
- API error

Use bounded retries only.

Suggested approach:
- research: 1 attempt + optional 1 retry
- writer: 1 attempt + optional 1 retry for schema/API failure
- editor: 1 attempt + optional 1 retry
- validator failure: retry only if the failure is plausibly model-correctable

Avoid recursive/unbounded regeneration.

## API and secrets

All model calls occur during build/generation.

Never call from the frontend.

Read API keys from environment/secrets.

Never commit secrets.

Keep model identifiers and generation settings configurable.

## Testing philosophy

Do not snapshot exact LLM wording.

Test:
- deterministic calculations
- normalized context
- story candidates
- schemas
- validator
- generation gating
- persistence
- source hashes
- retry behavior
- mocked model calls

Use Week 8 2025 as the first golden deterministic fixture.

## Observability

Logs should make it easy to tell:
- whether generation ran
- season/week
- source hash
- research success/failure
- writer success/failure
- editor success/failure
- validation result
- prompt versions
- model configuration
- persisted output location
- whether a later source hash changed

Do not log secrets.

## Scope control

Do not:
- add a database
- add a runtime backend
- call LLMs in the browser
- duplicate standings logic
- duplicate power-ranking logic
- let the model calculate authoritative scores/records
- refactor unrelated architecture
- regenerate every recap every day

The recap feature should feel native to the existing build system.
