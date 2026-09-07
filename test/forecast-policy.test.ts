import { describe, expect, it } from "vitest";

import {
  forecastCoverage,
  getTargetDates,
  isFreshSnapshot,
  isStaleFallbackEligible,
} from "../src/forecast-policy.js";

describe("destination-local forecast dates", () => {
  it("returns the seven complete dates after the destination's current date", () => {
    const now = new Date("2026-09-06T22:30:00.000Z");

    expect(getTargetDates(now, "Africa/Johannesburg")).toEqual([
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
      "2026-09-14",
    ]);
    expect(getTargetDates(now, "America/New_York")[0]).toBe("2026-09-07");
  });

  it("advances calendar dates across month and year boundaries", () => {
    expect(getTargetDates(new Date("2026-12-31T12:00:00.000Z"), "UTC")).toEqual(
      [
        "2027-01-01",
        "2027-01-02",
        "2027-01-03",
        "2027-01-04",
        "2027-01-05",
        "2027-01-06",
        "2027-01-07",
      ],
    );
  });
});

describe("snapshot lifecycle policy", () => {
  const requiredDates = ["2026-09-07", "2026-09-08"];
  const completeSnapshot = {
    locationId: "3369157",
    fetchedAt: new Date("2026-09-06T10:00:00.000Z"),
    coveredDates: new Set(["2026-09-07", "2026-09-08"]),
  };

  it("requires actual coverage as well as age under three hours for normal reuse", () => {
    expect(
      isFreshSnapshot(
        completeSnapshot,
        "3369157",
        requiredDates,
        new Date("2026-09-06T12:59:59.999Z"),
      ),
    ).toBe(true);
    expect(
      isFreshSnapshot(
        completeSnapshot,
        "3369157",
        requiredDates,
        new Date("2026-09-06T13:00:00.000Z"),
      ),
    ).toBe(false);
    expect(
      isFreshSnapshot(
        { ...completeSnapshot, coveredDates: new Set(["2026-09-07"]) },
        "3369157",
        requiredDates,
        new Date("2026-09-06T11:00:00.000Z"),
      ),
    ).toBe(false);
  });

  it("permits refresh-failure fallback through 24 hours, with sufficient coverage", () => {
    expect(
      isStaleFallbackEligible(
        completeSnapshot,
        "3369157",
        requiredDates,
        new Date("2026-09-07T10:00:00.000Z"),
      ),
    ).toBe(true);
    expect(
      isStaleFallbackEligible(
        completeSnapshot,
        "3369157",
        requiredDates,
        new Date("2026-09-07T10:00:00.001Z"),
      ),
    ).toBe(false);
  });

  it("never reuses a snapshot for a different canonical location", () => {
    const now = new Date("2026-09-06T11:00:00.000Z");

    expect(isFreshSnapshot(completeSnapshot, "other", requiredDates, now)).toBe(
      false,
    );
    expect(
      isStaleFallbackEligible(completeSnapshot, "other", requiredDates, now),
    ).toBe(false);
  });

  it("derives coverage from actual returned local timestamps", () => {
    expect(
      forecastCoverage([
        "2026-09-07T00:00",
        "2026-09-07T23:00",
        "2026-09-09T00:00",
      ]),
    ).toEqual(new Set(["2026-09-07", "2026-09-09"]));
  });

  it("does not require exactly 24 hourly observations for a covered local date - can deal with 23", () => {
    const timestamps = Array.from(
      { length: 23 },
      (_, hour) =>
        `2026-03-08T${String(hour < 2 ? hour : hour + 1).padStart(2, "0")}:00`,
    );

    expect(forecastCoverage(timestamps)).toEqual(new Set(["2026-03-08"]));
  });

  it("does not require exactly 24 hourly observations for a covered local date - can deal with 25", () => {
    const timestamps = Array.from(
      { length: 25 },
      (_, hour) =>
        `2026-03-08T${String(hour < 2 ? hour : hour - 1).padStart(2, "0")}:00`,
    );

    expect(forecastCoverage(timestamps)).toEqual(new Set(["2026-03-08"]));
  });
});
