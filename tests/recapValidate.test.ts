import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { validateRecap, validateAgainstSchema, RecapArticle, ValidateOptions, RESEARCH_SCHEMA_PATH, PERSISTED_SCHEMA_PATH } from "../src/core/recapSchema.js";
import { loadStyleRules, NOT_X_BUT_Y } from "../src/core/styleRules.js";

const FACTS = new Set([
  "2025-w08-high-connordolan14-score",
  "2025-w08-low-dackerly36-score",
  "2025-w08-bench-chrisrenna17-tua",
  "2025-w08-losing-streak-dackerly36-l8",
  "2025-w08-power-jump-jtyurconic2-4",
  "2025-w08-coincidence-all-winners-top-six",
]);

const baseOpts = (over: Partial<ValidateOptions> = {}): ValidateOptions => ({
  knownFactIds: FACTS,
  knownExternalIds: new Set(["2025-w08-jets-first-win", "2025-w08-perry-trudeau"]),
  knownTeamNames: ["New England Keys", "Woodys Toy Box", "The Permanent Rebuild"],
  knownHandles: ["connordolan14", "dball11", "dackerly36"],
  knownPlayerNames: ["C.J. Stroud", "Elic Ayomanor", "Jonathan Taylor"],
  ...over,
});

// ~650 words, inside the 600-800 hard range.
const filler = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
const body = [
  "New England Keys put 160.59 on the board, which was more than anyone else managed and very nearly double what the bottom of the league produced. " + filler(300),
  "Woodys Toy Box benched C.J. Stroud for Elic Ayomanor and then lost by less than the difference between them. " + filler(305),
];

const good = (over: Partial<RecapArticle> = {}): RecapArticle => ({
  title: "Week 8 Recap",
  body,
  for_the_record: [
    { text: "The bottom of the table found a new floor.", fact_ids: ["2025-w08-low-dackerly36-score"] },
    { text: "An eight game losing streak is now a streak.", fact_ids: ["2025-w08-losing-streak-dackerly36-l8"] },
    { text: "Four spots of power ranking movement in one week.", fact_ids: ["2025-w08-power-jump-jtyurconic2-4"] },
  ],
  used_body_fact_ids: ["2025-w08-high-connordolan14-score", "2025-w08-bench-chrisrenna17-tua"],
  external_context_used: [],
  team_bits_used: [{ team: "The Permanent Rebuild", theme: "rebuild that never ends" }],
  opening_mechanism: "statistical absurdity",
  ending_mechanism: "dry callback",
  ...over,
});

describe("style rules parsed from the writer prompt", () => {
  const rules = loadStyleRules();
  it("finds the section 19 banned phrase list", () => {
    expect(rules.bannedPhrases).toContain("statement win");
    expect(rules.bannedPhrases).toContain("when the dust settled");
    expect(rules.bannedPhrases.length).toBeGreaterThan(20);
  });
  it("treats bare common words as discouraged, not banned", () => {
    expect(rules.discouragedWords).toContain("chaos");
    expect(rules.discouragedWords).toContain("meanwhile");
    expect(rules.bannedPhrases).not.toContain("chaos");
  });
  it("finds the banned headline list from section 1", () => {
    expect(rules.bannedTitles).toContain("chaos reigns");
    expect(rules.bannedTitles).toContain("statement week");
  });
});

describe("negate-then-correct detection", () => {
  it("catches the constructions section 18 bans", () => {
    for (const s of [
      "It's not a rebuild, it's a demolition.",
      "This isn't bad luck. It is a lineup problem.",
      "Not a rebuild, but a controlled demolition.",
    ]) expect(NOT_X_BUT_Y.test(s)).toBe(true);
  });

  it("does not flag the mock-authority concessive construction the prompt allows", () => {
    for (const s of [
      "I am not a fantasy scoring engineer, but 70.65 seems low.",
      "I'm no breathing scientist, but that sounded wrong.",
      "He is not the highest scorer, but he started.",
    ]) expect(NOT_X_BUT_Y.test(s)).toBe(false);
  });
});

describe("validateRecap", () => {
  it("accepts a clean article", () => {
    const r = validateRecap(good(), baseOpts());
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.stats.forTheRecord).toBe(3);
  });

  it("rejects anything that fails output-schema.json", () => {
    expect(validateRecap(null, baseOpts()).ok).toBe(false);
    // additionalProperties:false, so an unexpected key is a schema failure
    expect(validateRecap({ ...good(), surprise: 1 }, baseOpts()).errors.some((e) => e.rule === "schema")).toBe(true);
    // for_the_record items require at least one fact id
    const noFacts = good(); noFacts.for_the_record[0].fact_ids = [];
    expect(validateRecap(noFacts, baseOpts()).errors.some((e) => e.rule === "schema")).toBe(true);
  });

  it("enforces the 600 to 800 word body range", () => {
    // Two paragraphs so the schema's minItems passes and the length rule is reached.
    expect(validateRecap(good({ body: ["Too short.", "Also short."] }), baseOpts()).errors.some((e) => e.rule === "length")).toBe(true);
    expect(validateRecap(good({ body: [filler(500), filler(500)] }), baseOpts()).errors.some((e) => e.rule === "length")).toBe(true);
    // 599 and 801 are both out; the bounds are inclusive.
    expect(validateRecap(good({ body: [filler(300), filler(299)] }), baseOpts()).errors.some((e) => e.rule === "length")).toBe(true);
    expect(validateRecap(good({ body: [filler(400), filler(401)] }), baseOpts()).errors.some((e) => e.rule === "length")).toBe(true);
    expect(validateRecap(good({ body: [filler(300), filler(300)] }), baseOpts()).errors.some((e) => e.rule === "length")).toBe(false);
    expect(validateRecap(good(), baseOpts()).errors.some((e) => e.rule === "length")).toBe(false);
  });

  it("enforces 3 to 5 For the record items via the schema", () => {
    const two = good({ for_the_record: good().for_the_record.slice(0, 2) });
    expect(validateRecap(two, baseOpts()).errors.some((e) => e.rule === "schema")).toBe(true);
    const six = good({
      for_the_record: Array.from({ length: 6 }, (_, i) => ({ text: `Item ${i}.`, fact_ids: ["2025-w08-low-dackerly36-score"] })),
    });
    expect(validateRecap(six, baseOpts({ allowFactReuse: true })).errors.some((e) => e.rule === "schema")).toBe(true);
  });

  it("caps non-NFL cultural references at two when no category info is given", () => {
    const three = good({ external_context_used: ["a", "b", "c"] });
    const r = validateRecap(three, baseOpts({ knownExternalIds: new Set(["a", "b", "c"]) }));
    expect(r.errors.some((e) => e.rule === "external_refs")).toBe(true);
  });

  it("does not cap real NFL context, only non-NFL cultural references", () => {
    const opts = baseOpts({
      knownExternalIds: new Set(["nfl-1", "nfl-2", "nfl-3", "nfl-4", "pop-1", "pop-2", "pop-3"]),
      externalCategories: new Map([
        ["nfl-1", "NFL"], ["nfl-2", "NFL"], ["nfl-3", "NFL"], ["nfl-4", "nfl"],
        ["pop-1", "Pop Culture"], ["pop-2", "Other Sports"], ["pop-3", "Pop Culture"],
      ]),
    });
    // Four NFL-category references: fine, uncapped.
    expect(validateRecap(good({ external_context_used: ["nfl-1", "nfl-2", "nfl-3", "nfl-4"] }), opts)
      .errors.some((e) => e.rule === "external_refs")).toBe(false);
    // Two non-NFL references: still fine, at the cap.
    expect(validateRecap(good({ external_context_used: ["pop-1", "pop-2"] }), opts)
      .errors.some((e) => e.rule === "external_refs")).toBe(false);
    // Three non-NFL references: over the cap.
    expect(validateRecap(good({ external_context_used: ["pop-1", "pop-2", "pop-3"] }), opts)
      .errors.some((e) => e.rule === "external_refs")).toBe(true);
    // Mixed: two NFL (free) plus two non-NFL (over the cap) -> still an error.
    expect(validateRecap(good({ external_context_used: ["nfl-1", "nfl-2", "pop-1", "pop-2", "pop-3"] }), opts)
      .errors.some((e) => e.rule === "external_refs")).toBe(true);
  });

  it("rejects a draft that fetched real NFL research and barely used it", () => {
    // Mirrors the actual rejected Week 1 draft: 7 NFL candidates supplied, 1 used.
    const opts = baseOpts({
      knownExternalIds: new Set(["nfl-1", "nfl-2", "nfl-3", "nfl-4", "nfl-5", "nfl-6", "nfl-7"]),
      externalCategories: new Map(
        ["nfl-1", "nfl-2", "nfl-3", "nfl-4", "nfl-5", "nfl-6", "nfl-7"].map((id) => [id, "NFL"]),
      ),
    });
    const underused = validateRecap(good({ external_context_used: ["nfl-1"] }), opts);
    expect(underused.errors.some((e) => e.rule === "underused_research")).toBe(true);
    const wellUsed = validateRecap(
      good({ external_context_used: ["nfl-1", "nfl-2", "nfl-3", "nfl-4"] }),
      opts,
    );
    expect(wellUsed.errors.some((e) => e.rule === "underused_research")).toBe(false);
  });

  it("does not require tier-one usage when no NFL candidates were supplied", () => {
    const opts = baseOpts({
      knownExternalIds: new Set(["pop-1"]),
      externalCategories: new Map([["pop-1", "Pop Culture"]]),
    });
    expect(validateRecap(good(), opts).errors.some((e) => e.rule === "underused_research")).toBe(false);
  });

  it("warns on a draft structured as one paragraph per matchup in schedule order", () => {
    const matchups = [
      { a: ["Team A", "usera"], b: ["Team B", "userb"] },
      { a: ["Team C", "userc"], b: ["Team D", "userd"] },
    ];
    const fillerA = filler(300).split(" ").map((w) => `a-${w}`).join(" ");
    const fillerB = filler(300).split(" ").map((w) => `b-${w}`).join(" ");
    const marched = good({
      body: [
        `Team A beat Team B this week, and that was that. ${fillerA}`,
        `Team C also won, this time against Team D. ${fillerB}`,
      ],
    });
    const r = validateRecap(marched, baseOpts({ matchups }));
    expect(r.warnings.some((w) => w.rule === "matchup_march_structure")).toBe(true);
    expect(r.ok).toBe(true); // fuzzy heuristic: warning, not a blocking error

    // A paragraph that crosses over into another matchup breaks the pattern.
    const notMarched = good({
      body: [
        `Team A beat Team B, and Team C was watching closely since Team C plays Team D next. ${fillerA.split(" ").slice(0, 290).join(" ")}`,
        `Team C also won, this time against Team D. ${fillerB}`,
      ],
    });
    expect(validateRecap(notMarched, baseOpts({ matchups })).warnings.some((w) => w.rule === "matchup_march_structure")).toBe(false);
  });

  it("rejects em dashes, hyphenated scores, emoji and hashtags", () => {
    expect(validateRecap(good({ title: "Week 8 — Recap" }), baseOpts()).errors.some((e) => e.rule === "em_dash")).toBe(true);
    expect(validateRecap(good({ body: [...body, "The final was 129.63-99.35."] }), baseOpts()).errors.some((e) => e.rule === "score_format")).toBe(true);
    expect(validateRecap(good({ body: [...body, "Great week 🔥"] }), baseOpts()).errors.some((e) => e.rule === "emoji")).toBe(true);
    expect(validateRecap(good({ body: [...body, "#fantasyfootball"] }), baseOpts()).errors.some((e) => e.rule === "hashtag")).toBe(true);
  });

  it("allows a score written as a phrase", () => {
    const r = validateRecap(good({ body: [...body, "The final was 129.63 to 99.35."] }), baseOpts());
    expect(r.errors.some((e) => e.rule === "score_format")).toBe(false);
  });

  it("rejects banned phrases from the writer prompt", () => {
    const r = validateRecap(good({ body: [...body, "When the dust settled it was a statement win."] }), baseOpts());
    const hits = r.errors.filter((e) => e.rule === "banned_phrase");
    expect(hits.length).toBe(2);
  });

  it("warns rather than fails on a bare discouraged word", () => {
    const r = validateRecap(good({ body: [...body, "Meanwhile the bottom of the table kept losing."] }), baseOpts());
    expect(r.warnings.some((w) => w.rule === "discouraged_word")).toBe(true);
    expect(r.ok).toBe(true);
  });

  it("rejects banned headline styles", () => {
    expect(validateRecap(good({ title: "CHAOS REIGNS" }), baseOpts()).errors.some((e) => e.rule === "banned_title")).toBe(true);
    expect(validateRecap(good({ title: "Week 8 Recap" }), baseOpts()).errors.some((e) => e.rule === "banned_title")).toBe(false);
  });

  it("rejects unknown fact ids and footer reuse of a body fact", () => {
    expect(validateRecap(good({ used_body_fact_ids: ["2025-w08-nope"] }), baseOpts()).errors.some((e) => e.rule === "unknown_fact_id")).toBe(true);
    const reuse = good();
    reuse.for_the_record[0].fact_ids = ["2025-w08-high-connordolan14-score"];
    expect(validateRecap(reuse, baseOpts()).errors.some((e) => e.rule === "fact_reuse")).toBe(true);
    expect(validateRecap(reuse, baseOpts({ allowFactReuse: true })).errors.some((e) => e.rule === "fact_reuse")).toBe(false);
  });

  it("accepts a footer item backed only by a researched external id (no local fact of its own)", () => {
    const article = good({ external_context_used: ["2025-w08-jets-first-win"] });
    article.for_the_record[0] = { text: "A real NFL milestone with no local WEEK_DATA fact behind it.", fact_ids: ["2025-w08-jets-first-win"] };
    const r = validateRecap(article, baseOpts());
    expect(r.errors.some((e) => e.rule === "unknown_fact_id")).toBe(false);
  });

  it("rejects external ids absent from the research packet", () => {
    expect(validateRecap(good({ external_context_used: ["made-up"] }), baseOpts()).errors.some((e) => e.rule === "unknown_external_id")).toBe(true);
    expect(validateRecap(good({ external_context_used: ["2025-w08-jets-first-win"] }), baseOpts()).errors.some((e) => e.rule === "unknown_external_id")).toBe(false);
    const noPacket = validateRecap(good({ external_context_used: ["2025-w08-jets-first-win"] }), baseOpts({ knownExternalIds: undefined }));
    expect(noPacket.errors.some((e) => e.rule === "unknown_external_id")).toBe(true);
  });

  it("rejects a fact id leaking into prose", () => {
    const r = validateRecap(good({ body: [...body, "See 2025-w08-bench-chrisrenna17-tua for details."] }), baseOpts());
    expect(r.errors.some((e) => e.rule === "metadata_leak")).toBe(true);
  });

  it("rejects a sentence repeated between body and footer", () => {
    const dup = "Woodys Toy Box benched C.J. Stroud and lost by less than the difference.";
    const a = good({ body: [body[0], `${dup} ${filler(200)}`] });
    a.for_the_record[0] = { text: dup, fact_ids: ["2025-w08-low-dackerly36-score"] };
    expect(validateRecap(a, baseOpts()).errors.some((e) => e.rule === "duplication")).toBe(true);
  });

  it("rejects an unknown handle but only warns on an unverified name", () => {
    const bad = validateRecap(good({ body: [...body, "Credit to @notarealmanager."] }), baseOpts());
    expect(bad.errors.some((e) => e.rule === "unknown_handle")).toBe(true);
    const warned = validateRecap(good({ body: [...body, "Credit to Fictional Person for the week."] }), baseOpts());
    expect(warned.warnings.some((w) => w.rule === "unverified_proper_noun")).toBe(true);
    expect(warned.ok).toBe(true);
  });

  it("does not flag the title's own title case", () => {
    const r = validateRecap(good({ title: "The Scoreboard Did The Arguing" }), baseOpts());
    expect(r.warnings.filter((w) => w.rule === "unverified_proper_noun")).toEqual([]);
  });
});

describe("published schemas are honoured directly", () => {
  it("validates the Week 8 research fixture against research-output-schema.json", () => {
    const packet = JSON.parse(readFileSync("fixtures/weekly-recap/2025-week-08/external-context.json", "utf8"));
    expect(validateAgainstSchema(packet, RESEARCH_SCHEMA_PATH)).toEqual([]);
  });

  it("rejects a research candidate missing its source", () => {
    const packet = JSON.parse(readFileSync("fixtures/weekly-recap/2025-week-08/external-context.json", "utf8"));
    delete packet.candidates[0].source_url;
    expect(validateAgainstSchema(packet, RESEARCH_SCHEMA_PATH).length).toBeGreaterThan(0);
  });

  it("validates the unpublished Week 8 test run against persisted-recap-schema.json", () => {
    const env = JSON.parse(readFileSync("fixtures/weekly-recap/2025-week-08/persisted-recap.json", "utf8"));
    expect(validateAgainstSchema(env, PERSISTED_SCHEMA_PATH)).toEqual([]);
    const missing: any = { ...env }; delete missing.source_data_hash;
    expect(validateAgainstSchema(missing, PERSISTED_SCHEMA_PATH).length).toBeGreaterThan(0);
  });
});
