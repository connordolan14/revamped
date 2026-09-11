# 2025 Week 8 Fixture

Publication date: Tuesday, October 28, 2025  
Context window: Tuesday, October 21 through Monday, October 27, 2025

## Files

- `source-fixture.minimal.json`: normalized/minimized source data for immediate tests
- `expected-facts.json`: deterministic truth table
- `external-context.json`: sample curated external context
- `approved-recap.md`: editorial reference, never an exact-output assertion
- `persisted-recap.json`: the unpublished test-run envelope used for schema regression
- `raw-sleeper/`: location for exact API payloads

## Sleeper endpoints

League:
`1253912888536481792`

Use:

- `https://api.sleeper.app/v1/league/1253912888536481792/matchups/8`
- `https://api.sleeper.app/v1/league/1253912888536481792/users`
- `https://api.sleeper.app/v1/league/1253912888536481792/rosters`
- `https://api.sleeper.app/v1/league/1253912888536481792/transactions/8`

The minimized fixture is enough to begin implementation.

For a full regression fixture, save the exact API responses to:

- `raw-sleeper/matchups.json`
- `raw-sleeper/users.json`
- `raw-sleeper/rosters.json`
- `raw-sleeper/transactions.json`

Do not make CI depend on Sleeper being live.
