import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { windowForWeek, windowForSeasonWeek, windowFromPublication, windowFromWeekEnd, nflSeasonStart } from "../src/core/recapWindow.js";

const minimal = JSON.parse(readFileSync("fixtures/weekly-recap/2025-week-08/source-fixture.minimal.json", "utf8"));

describe("recap window", () => {
  it("matches the Week 8 2025 fixture exactly", () => {
    const w = windowFromPublication(minimal.publication_date);
    expect(w.publicationDate).toBe("2025-10-28");
    expect(w.contextWindow.start).toBe(minimal.context_window.start); // 2025-10-21
    expect(w.contextWindow.end).toBe(minimal.context_window.end);     // 2025-10-27
  });

  it("spans exactly Tuesday through Monday", () => {
    const { contextWindow } = windowFromPublication("2025-10-28");
    const start = new Date(`${contextWindow.start}T00:00:00Z`);
    const end = new Date(`${contextWindow.end}T00:00:00Z`);
    expect(start.getUTCDay()).toBe(2); // Tuesday
    expect(end.getUTCDay()).toBe(1);   // Monday
    expect((end.getTime() - start.getTime()) / 86_400_000).toBe(6);
  });

  it("always publishes on a Tuesday", () => {
    for (const d of ["2025-10-27", "2025-10-26", "2025-10-24", "2025-10-21"]) {
      const w = windowFromWeekEnd(d);
      expect(new Date(`${w.publicationDate}T00:00:00Z`).getUTCDay()).toBe(2);
    }
  });

  it("derives Week 8 2025 from the season start date", () => {
    // 2025 NFL season opened Thursday 2025-09-04.
    const w = windowForWeek("2025-09-04", 8);
    expect(w.publicationDate).toBe("2025-10-28");
    expect(w.contextWindow).toEqual({ start: "2025-10-21", end: "2025-10-27" });
  });

  it("advances exactly seven days per week", () => {
    const a = windowForWeek("2025-09-04", 8);
    const b = windowForWeek("2025-09-04", 9);
    const delta = (new Date(`${b.publicationDate}T00:00:00Z`).getTime() - new Date(`${a.publicationDate}T00:00:00Z`).getTime()) / 86_400_000;
    expect(delta).toBe(7);
  });

  it("derives each season's opener as the Thursday after Labor Day", () => {
    expect(nflSeasonStart(2025)).toBe("2025-09-04");
    expect(nflSeasonStart("2024")).toBe("2024-09-05");
    for (const y of [2023, 2024, 2025, 2026, 2027]) {
      expect(new Date(`${nflSeasonStart(y)}T00:00:00Z`).getUTCDay()).toBe(4); // Thursday
    }
  });

  it("uses the requested season's calendar, not the current one", () => {
    // The bug this guards: a 2025 week must not publish in 2026.
    expect(windowForSeasonWeek(2025, 8).publicationDate).toBe("2025-10-28");
    expect(windowForSeasonWeek(2025, 8).contextWindow).toEqual({ start: "2025-10-21", end: "2025-10-27" });
    expect(windowForSeasonWeek(2026, 8).publicationDate.startsWith("2026-")).toBe(true);
  });

  it("handles week 1 and is timezone independent", () => {
    const w1 = windowForWeek("2025-09-04", 1);
    expect(w1.publicationDate).toBe("2025-09-09");
    const prev = process.env.TZ;
    try {
      process.env.TZ = "Pacific/Kiritimati"; // UTC+14
      expect(windowForWeek("2025-09-04", 8).publicationDate).toBe("2025-10-28");
      process.env.TZ = "Pacific/Midway"; // UTC-11
      expect(windowForWeek("2025-09-04", 8).publicationDate).toBe("2025-10-28");
    } finally { process.env.TZ = prev; }
  });
});
