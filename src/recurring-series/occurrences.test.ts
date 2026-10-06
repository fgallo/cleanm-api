import { describe, expect, it } from "vitest";

import { addDays, occurrences } from "./occurrences.ts";

function weekly(startDate: string, everyWeeks: number) {
  return { startDate, everyWeeks, dayOfMonth: null };
}

function monthly(startDate: string, dayOfMonth: number) {
  return { startDate, everyWeeks: null, dayOfMonth };
}

describe("addDays", () => {
  it("crosses months and years", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("occurrences every N weeks", () => {
  it("starts on the start date and keeps its weekday", () => {
    // 2026-10-13 is a Tuesday.
    expect(
      occurrences(weekly("2026-10-13", 1), "2026-10-01", "2026-11-03"),
    ).toEqual(["2026-10-13", "2026-10-20", "2026-10-27", "2026-11-03"]);
  });

  it("skips weeks for biweekly and every four weeks", () => {
    expect(
      occurrences(weekly("2026-10-13", 2), "2026-10-13", "2026-12-08"),
    ).toEqual([
      "2026-10-13",
      "2026-10-27",
      "2026-11-10",
      "2026-11-24",
      "2026-12-08",
    ]);
    expect(
      occurrences(weekly("2026-10-13", 4), "2026-10-13", "2026-12-08"),
    ).toEqual(["2026-10-13", "2026-11-10", "2026-12-08"]);
  });

  it("stays on the cycle when the range starts later", () => {
    // Biweekly from the 13th: the 27th, then the 10th. A range starting on
    // the 20th must not restart the cycle from the 20th.
    expect(
      occurrences(weekly("2026-10-13", 2), "2026-10-20", "2026-11-10"),
    ).toEqual(["2026-10-27", "2026-11-10"]);
    expect(
      occurrences(weekly("2026-10-13", 2), "2026-10-27", "2026-11-10"),
    ).toEqual(["2026-10-27", "2026-11-10"]);
  });

  it("is not shifted by daylight saving time", () => {
    // Toronto moves its clocks on 2027-03-14; the Sundays stay Sundays.
    expect(
      occurrences(weekly("2027-03-07", 1), "2027-03-07", "2027-03-21"),
    ).toEqual(["2027-03-07", "2027-03-14", "2027-03-21"]);
  });

  it("returns nothing before the start date or for an empty range", () => {
    expect(
      occurrences(weekly("2026-10-13", 1), "2026-09-01", "2026-10-12"),
    ).toEqual([]);
    expect(
      occurrences(weekly("2026-10-13", 1), "2026-11-01", "2026-10-01"),
    ).toEqual([]);
  });
});

describe("occurrences on a day of the month", () => {
  it("visits the same day every month", () => {
    expect(
      occurrences(monthly("2026-10-14", 14), "2026-10-01", "2027-01-31"),
    ).toEqual(["2026-10-14", "2026-11-14", "2026-12-14", "2027-01-14"]);
  });

  it("starts in the following month when the start date is past the day", () => {
    expect(
      occurrences(monthly("2026-10-20", 14), "2026-10-01", "2026-12-31"),
    ).toEqual(["2026-11-14", "2026-12-14"]);
  });

  it("falls back to the last day of shorter months", () => {
    expect(
      occurrences(monthly("2027-01-31", 31), "2027-01-01", "2027-05-31"),
    ).toEqual([
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
      "2027-04-30",
      "2027-05-31",
    ]);
    // 2028 is a leap year.
    expect(
      occurrences(monthly("2028-01-30", 30), "2028-02-01", "2028-02-29"),
    ).toEqual(["2028-02-29"]);
  });

  it("respects the range", () => {
    expect(
      occurrences(monthly("2026-01-14", 14), "2026-10-15", "2026-12-13"),
    ).toEqual(["2026-11-14"]);
  });
});
