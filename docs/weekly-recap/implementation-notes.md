# Implementation Notes / Recommended Module Boundaries

These names are illustrative. Adapt them to the repository's existing language and conventions.

Possible modules:

- `recap/context`
  - `buildRecapContext(season, week, siteData)`
- `recap/candidates`
  - `buildStoryCandidates(context)`
- `recap/research`
  - `researchExternalContext(window)`
- `recap/writer`
  - `generateRecap(context, external, recent)`
- `recap/editor`
  - `editRecap(draft, context, external, recent)`
- `recap/validate`
  - `validateRecap(recap, context, external)`
- `recap/persist`
  - `loadRecap(season, week)`
  - `saveRecap(...)`
  - `hashRecapSource(context)`
- `recap/memory`
  - `buildRecentRecapContext(season, week)`
- `recap/cli`
  - force/manual generation entry point

Do not create these modules if the repository already has natural equivalents.

## Suggested orchestration

Pseudo-code:

```ts
async function ensureWeeklyRecap(season, week, options = {}) {
  const existing = await loadPersistedRecap(season, week);

  const weekData = buildRecapContext(season, week);
  const sourceHash = hashStableWeekData(weekData);

  if (existing && !options.force) {
    if (existing.source_data_hash !== sourceHash) {
      logSourceHashMismatch(existing, sourceHash);
    }
    return existing;
  }

  const recent = buildRecentRecapContext(season, week);

  let external = emptyExternalContext();
  try {
    external = await researchExternalContext(weekData.context_window);
  } catch (error) {
    logResearchFailure(error);
  }

  const draft = await generateRecap(weekData, external, recent);
  const edited = await editRecap(draft, weekData, external, recent);

  validateRecap(edited, weekData, external);

  const envelope = {
    season,
    week,
    generated_at: new Date().toISOString(),
    source_data_hash: sourceHash,
    prompt_versions: getPromptVersions(),
    models: getModelConfig(),
    recap: edited
  };

  await savePersistedRecap(envelope);
  return envelope;
}
```

## Stable hashing

Hash normalized deterministic source data, not:
- research output
- model output
- generated timestamp
- non-deterministic object ordering

Canonicalize object keys before hashing.

## Historical-week correctness

Be careful with:
- current rosters vs as-of-week rosters
- current team names vs historical names
- final-season record fields
- power rankings calculated using future weeks
- current playoff seed reused for an old week

Tests should explicitly protect against future leakage.

## Player metadata

Use the site's existing player dictionary if possible.

The recap layer should receive:
- player ID
- resolved name
- position
- score
- starter/bench state

Do not make the LLM resolve player IDs.

## Model configuration

Keep settings configurable, for example:

- research model
- writer model
- editor model
- writer temperature/reasoning settings
- retry counts
- hard word-count limits
- prompt version IDs

Do not scatter model strings through the codebase.

## Word count

Count only main body paragraphs for the body target unless product requirements later decide otherwise.

Recommended:
- editorial target: 400–500
- hard validator range: 350–550

The footer is outside the body count.

## Banned-phrase validation

Use the permanent writer prompt's explicit banned phrase list as a configurable validator list.

Be cautious with very short/common words.

The validator should reject obvious exact stock phrases, not accidentally reject normal prose because a common word appears in another context.

## Semantic footer duplication

Fact IDs solve many cases, but not all.

V1 can enforce:
- footer fact IDs must not be a subset/equal to a body-used fact ID set

The editor prompt handles semantic duplication beyond exact IDs.

Do not build a complex embedding system just to detect duplicate jokes in v1.
