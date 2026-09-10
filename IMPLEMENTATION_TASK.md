# Initial Coding-Agent Task

Implement the Revamped League weekly recap feature described in `docs/weekly-recap/`.

## First phase: repository investigation only

Before changing any code, inspect the repository and report:

1. Where Sleeper league, roster, matchup, player, and transaction data are fetched.
2. Where team names and usernames are resolved.
3. Where weekly and historical league statistics are calculated.
4. How the existing six-factor power ranking is calculated and whether it can be evaluated as-of a historical week.
5. How a completed NFL/fantasy week is detected.
6. Where the site's final JSON payload is assembled.
7. Where the current fill-in-the-blank weekly recap is generated and rendered.
8. How scheduled daily/Tuesday refreshes run.
9. What persistence survives one build/deployment to the next.
10. Existing test, lint, format, type-check, and production-build commands.
11. The smallest clean integration point for the recap pipeline.
12. Any conflicts between the existing architecture and the feature spec.

Do not modify files during this first phase.

## Second phase: implementation

After the architecture is understood, implement the feature in incremental stages:

1. Deterministic weekly recap context builder.
2. Deterministic story-candidate derivation and stable fact IDs.
3. Week 8 fixture tests.
4. External-context research client.
5. Writer client using the approved permanent writer prompt.
6. Editor/QC client.
7. Deterministic output validator.
8. Persistence/idempotency and source hash behavior.
9. Manual force-regeneration command.
10. Existing homepage/week-selector integration.
11. Mocked integration tests.
12. Documentation.

Favor the smallest integration that preserves the existing static-site architecture.

Do not introduce a database or runtime backend.
Do not call an LLM from the browser.
Do not duplicate statistics that the existing engine already calculates.
Do not allow the model to become authoritative for factual league calculations.
