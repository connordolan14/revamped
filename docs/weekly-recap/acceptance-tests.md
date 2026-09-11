# Weekly Recap Acceptance Tests

These are product/engineering acceptance criteria, not exact implementation requirements.

## A. Repository integration

- Existing production build succeeds.
- Existing homepage/week dropdown still works.
- Unrelated site data remains deterministic.
- No runtime backend is introduced.
- No LLM call is made from browser/client code.
- API secrets never enter client bundles.

## B. Deterministic Week 8 fixture

Given the Week 8 2025 fixture:

Expected weekly scoring order:

1. New England Keys — 160.59
2. jtyurconic2 — 154.22
3. Mark 2.0 — 129.63
4. Jayden's Blue Balls — 129.32
5. Woodys Toy Box — 118.98
6. BrendanBall03 — 118.75
7. chrisrenna17 — 107.00
8. New York Mudbones — 105.12
9. Green Egbukas & Ham — 99.91
10. Jerking Goff — 99.35
11. Injured Reserve — 84.19
12. The Permanent Rebuild — 70.65

Expected largest margin:
- New England Keys over Injured Reserve by 76.40

Expected closest margin:
- Woodys Toy Box over New York Mudbones by 13.86

Expected H2H winners:
- New England Keys
- jtyurconic2
- Mark 2.0
- Jayden's Blue Balls
- Woodys Toy Box
- BrendanBall03

Expected special weekly coincidence:
- all six H2H winners were also the six highest-scoring teams

Expected Week 8 H2H records from supplied season strings:
- The Permanent Rebuild: 0-8
- Jayden's Blue Balls: 5-3
- Green Egbukas & Ham: 3-5
- Jerking Goff: 2-6
- Injured Reserve: 6-2
- Woodys Toy Box: 4-4
- New York Mudbones: 6-2
- New England Keys: 5-3
- jtyurconic2: 5-3
- chrisrenna17: 3-5
- Mark 2.0: 5-3
- BrendanBall03: 4-4

Known player fixture checks:
- Jonathan Taylor, Sleeper 6813, scored 36.4
- Tucker Kraft, Sleeper 9484, scored 31.55 under league scoring
- Jordan Love, Sleeper 6804, scored 28.3
- Chase Brown, Sleeper 9224, scored 24.0 under league scoring
- James Cook, Sleeper 8138, scored 33.6
- Tua Tagovailoa, Sleeper 6768, scored 24.2 on chrisrenna17's bench
- Tyler Huntley, Sleeper 7083, was added by New England Keys during Week 8 and scored 16.74 as a starter

If existing player metadata produces names, prefer that source rather than hard-coding these mappings in production.

## C. Context builder

- Uses existing site calculations where available.
- Does not duplicate standings/power logic unnecessarily.
- Resolves roster IDs to team names/usernames.
- Resolves player IDs before model input.
- Produces stable fact IDs.
- Can be run for a historical week.
- Does not accidentally use end-of-season standings/power values as historical Week 8 values.
- Unknown historical fields are null rather than guessed.

## D. External research

- Uses exact Tuesday-through-Monday date window.
- Returns structured candidates.
- Every candidate has a source.
- Does not write recap prose.
- Research failure can degrade to empty external context.
- Sensitive tragedies are excluded from comedy candidates.

## E. Writer

- Permanent writer prompt is loaded from a single source of truth.
- Structured output matches schema.
- Maximum two external context IDs.
- Only supplied fact IDs are referenced.
- Only supplied external context IDs are referenced.

## F. Editor

- Receives original draft and source context.
- Preserves strong prose instead of rewriting everything.
- Can remove unsupported facts.
- Can remove duplicate footer items.
- Returns same schema.

## G. Validator

Automated validator rejects:
- invalid schema
- body outside configured word-count hard bounds
- fewer than 3 or more than 5 footer items
- em dash character
- compact score notation such as `129.63-99.35`
- unknown fact ID
- unknown external-context ID
- more than two external references
- configured banned phrases
- direct body/footer fact-ID duplication

Where feasible, validator should also flag unknown team/user references.

## H. Idempotency

Scenario:
1. Tuesday build runs.
2. Week recap does not exist.
3. Generation succeeds.
4. Recap is persisted.
5. Wednesday build runs.

Expected:
- Wednesday reuses Tuesday's exact recap.
- No writer/editor/research call occurs.

## I. Stat correction

Scenario:
1. Recap exists with source hash A.
2. Sleeper data later produces source hash B.

Expected:
- existing recap remains unchanged
- system logs/surfaces hash mismatch
- no silent regeneration
- force command can regenerate deliberately

## J. Failure safety

Given a valid prior recap:
- failed model call does not overwrite it
- malformed JSON does not overwrite it
- failed validation does not overwrite it

Given no prior recap:
- generation failure does not corrupt site JSON
- behavior is logged
- subsequent/manual retry is possible

## K. Manual generation

Developer can:
- generate a missing specific week
- force regenerate a specific week
- identify persisted output path

## L. CI

CI tests should not:
- make paid model calls
- require Sleeper to be live
- require web search

Use mocks and fixtures.

## M. Editorial QA

Do not assert exact model wording in CI.

For manual Week 8 review:
- compare against `approved-recap.md`
- look for specificity
- avoid generic sports copy
- body and footer should not repeat the same fact
- outside references should connect naturally to league facts
