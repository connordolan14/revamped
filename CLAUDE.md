# Claude Code Project Instructions

Before making changes, understand the existing architecture and reuse existing data/statistics code.

For the Weekly Recap feature, read:

- `IMPLEMENTATION_TASK.md`
- `docs/weekly-recap/README.md`
- `docs/weekly-recap/data-contract.md`
- `docs/weekly-recap/research-prompt.md`
- `docs/weekly-recap/editor-prompt.md`
- `docs/weekly-recap/output-schema.json`
- `docs/weekly-recap/acceptance-tests.md`
- `fixtures/weekly-recap/2025-week-08/`

The approved permanent writer prompt should live at `docs/weekly-recap/writer-prompt.md`.

Do not:
- introduce a database
- introduce a runtime backend
- expose API keys client-side
- perform LLM calls from the frontend
- replace deterministic statistics with model-generated facts
- create a second shadow standings/power-ranking engine
- refactor unrelated site architecture without a concrete need
- make old recaps regenerate on every scheduled build

Before declaring work complete, run the repository's lint, type-check, test, and production-build commands.
