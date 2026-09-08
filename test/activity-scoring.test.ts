import { describe, expect, it } from "vitest";

import { scoreActivities } from "../src/activity-scoring.js";
import type {
  MarineObservation,
  SourceForecast,
  WeatherObservation,
} from "../src/open-meteo.js";

const date = "2026-09-08";

describe("activity scoring", () => {
  it("applies the global heat veto to every activity during the relevant period", () => {
    const weather = weatherForecast({ apparentTemperature: { 10: 45, 11: 45 } });

    expect(scoreActivities(weather, marineForecast(), [date])).toEqual({
      skiing: ["UNSUITABLE"],
      surfing: ["UNSUITABLE"],
      outdoorSightseeing: ["UNSUITABLE"],
      indoorSightseeing: ["UNSUITABLE"],
    });
  });

  it("uses a sustained comfortable outdoor period and keeps indoor at GOOD", () => {
    const result = scoreActivities(weatherForecast(), marineForecast(), [date]);

    expect(result.outdoorSightseeing).toEqual(["EXCELLENT"]);
    expect(result.indoorSightseeing).toEqual(["GOOD"]);
  });

  it("returns UNKNOWN where ordinary weather evidence is unavailable", () => {
    const result = scoreActivities(null, marineForecast(), [date]);

    expect(result.outdoorSightseeing).toEqual(["UNKNOWN"]);
    expect(result.skiing).toEqual(["UNKNOWN"]);
    expect(result.indoorSightseeing).toEqual(["UNKNOWN"]);
  });

  it("caps a heavily rained-on sightseeing day at POOR without calling it a hazard", () => {
    const result = scoreActivities(
      weatherForecast({ precipitation: allHours(3) }),
      marineForecast(),
      [date],
    );

    expect(result.outdoorSightseeing).toEqual(["POOR"]);
  });

  it("requires a complete three-hour outdoor window", () => {
    const apparentTemperature = allHours(null);
    apparentTemperature[9] = 22;
    apparentTemperature[10] = 22;
    const weather = weatherForecast({ apparentTemperature });

    expect(scoreActivities(weather, marineForecast(), [date]).outdoorSightseeing).toEqual([
      "UNKNOWN",
    ]);
  });

  it("turns one two-hour excellent surf opportunity into a GOOD day", () => {
    const windSpeed = allHours(50);
    windSpeed[9] = 8;
    windSpeed[10] = 8;
    const weather = weatherForecast({ windSpeed });

    expect(scoreActivities(weather, marineForecast(), [date]).surfing).toEqual(["GOOD"]);
  });

  it("uses expected surf slots for sparse evidence and only preserves a complete opportunity", () => {
    const oneHour = retainHours(marineForecast(), [9]);
    const twoHours = retainHours(marineForecast(), [9, 10]);

    expect(scoreActivities(weatherForecast(), oneHour, [date]).surfing).toEqual([
      "UNKNOWN",
    ]);
    expect(scoreActivities(weatherForecast(), twoHours, [date]).surfing).toEqual([
      "GOOD",
    ]);
  });

  it("does not turn sparse adverse or non-contiguous surf evidence into a daily conclusion", () => {
    const adverse = retainHours(
      marineForecast({
        waveHeight: allHours(0.2),
        swellPeriod: allHours(4),
        wavePeriod: allHours(4),
      }),
      [9, 10],
    );
    const gap = retainHours(marineForecast(), [9, 11]);

    expect(scoreActivities(weatherForecast(), adverse, [date]).surfing).toEqual([
      "UNKNOWN",
    ]);
    expect(scoreActivities(weatherForecast(), gap, [date]).surfing).toEqual(["UNKNOWN"]);
  });

  it("caps partial surf evidence and applies its single-opportunity mapping", () => {
    const fourExcellentHours = retainHours(marineForecast(), [8, 9, 10, 11]);
    const twoGoodHours = retainHours(
      marineForecast({ waveHeight: allHours(0.7) }),
      [9, 10],
    );

    expect(scoreActivities(weatherForecast(), fourExcellentHours, [date]).surfing).toEqual([
      "GOOD",
    ]);
    expect(scoreActivities(weatherForecast(), twoGoodHours, [date]).surfing).toEqual([
      "FAIR",
    ]);
  });

  it("distinguishes full-horizon structural marine nulls from a provider failure", () => {
    const structurallyNull = marineForecast({
      waveHeight: allHours(null),
      swellPeriod: allHours(null),
      wavePeriod: allHours(null),
    });

    expect(scoreActivities(weatherForecast(), structurallyNull, [date]).surfing).toEqual([
      "UNSUITABLE",
    ]);
    expect(scoreActivities(weatherForecast(), null, [date]).surfing).toEqual(["UNKNOWN"]);
  });

  it("scores sustained strong skiing and enforces snow prerequisites", () => {
    const strong = weatherForecast({
      airTemperature: allHours(0),
      snowDepth: allHours(0.4),
    });
    const missingSnow = weatherForecast({ snowDepth: allHours(null) });

    expect(scoreActivities(strong, marineForecast(), [date]).skiing).toEqual(["EXCELLENT"]);
    expect(scoreActivities(weatherForecast(), marineForecast(), [date]).skiing).toEqual([
      "UNSUITABLE",
    ]);
    expect(scoreActivities(missingSnow, marineForecast(), [date]).skiing).toEqual(["UNKNOWN"]);
  });

  it("uses expected ski slots for sparse evidence and only preserves a complete block", () => {
    const strong = weatherForecast({
      airTemperature: allHours(0),
      snowDepth: allHours(0.4),
    });

    expect(scoreActivities(retainHours(strong, [8, 9, 10]), marineForecast(), [date]).skiing)
      .toEqual(["UNKNOWN"]);
    expect(
      scoreActivities(retainHours(strong, [8, 9, 10, 11]), marineForecast(), [date]).skiing,
    ).toEqual(["GOOD"]);
  });

  it("uses block-local snow caps and rejects sparse adverse ski evidence", () => {
    const marginalSnow = weatherForecast({
      airTemperature: allHours(0),
      snowDepth: allHours(0.1),
    });
    const rainy = weatherForecast({
      airTemperature: allHours(0),
      snowDepth: allHours(0.4),
      rain: allHours(1),
    });

    expect(
      scoreActivities(
        retainHours(marginalSnow, [8, 9, 10, 11]),
        marineForecast(),
        [date],
      ).skiing,
    ).toEqual(["FAIR"]);
    expect(
      scoreActivities(retainHours(rainy, [8, 9, 10, 11]), marineForecast(), [date])
        .skiing,
    ).toEqual(["UNKNOWN"]);
  });

  it("keeps sufficiently evidenced no-snow failure above the partial fallback", () => {
    const snowDepth = allHours(null);
    for (const hour of [8, 9, 10, 11, 12, 13, 14]) snowDepth[hour] = 0;
    const airTemperature = allHours(null);

    expect(
      scoreActivities(
        weatherForecast({ snowDepth, airTemperature }),
        marineForecast(),
        [date],
      ).skiing,
    ).toEqual(["UNSUITABLE"]);
  });

  it("caps marginal snow and upgrades indoor only when weather removes alternatives", () => {
    const marginal = weatherForecast({
      airTemperature: allHours(0),
      snowDepth: allHours(0.1),
    });
    const badOutdoors = weatherForecast({ precipitation: allHours(3) });
    const poorSurf = marineForecast({ waveHeight: allHours(0.2) });

    expect(scoreActivities(marginal, marineForecast(), [date]).skiing).toEqual(["FAIR"]);
    expect(scoreActivities(badOutdoors, poorSurf, [date]).indoorSightseeing).toEqual([
      "EXCELLENT",
    ]);
    expect(scoreActivities(badOutdoors, null, [date]).indoorSightseeing).toEqual(["GOOD"]);
  });
});

type HourOverrides = Partial<
  Record<WeatherObservation, Partial<Record<number, number | null>>>
>;

function weatherForecast(overrides: HourOverrides = {}): SourceForecast<WeatherObservation> {
  const localTimestamps = hours().map((hour) => `${date}T${String(hour).padStart(2, "0")}:00`);
  const defaults: Record<WeatherObservation, number> = {
    airTemperature: 22,
    apparentTemperature: 22,
    precipitation: 0,
    rain: 0,
    snowfall: 0,
    snowDepth: 0,
    windSpeed: 8,
    windGust: 12,
    visibility: 12_000,
    weatherCode: 0,
    cloudCover: 10,
  };
  const observations = Object.fromEntries(
    (Object.keys(defaults) as WeatherObservation[]).map((key) => [
      key,
      hours().map((hour) =>
        overrides[key] !== undefined && hour in overrides[key]!
          ? overrides[key]![hour]!
          : defaults[key],
      ),
    ]),
  ) as Record<WeatherObservation, (number | null)[]>;
  return {
    localTimestamps,
    observations,
    solarDays: [
      { date, sunrise: `${date}T06:00`, sunset: `${date}T18:00` },
    ],
  };
}

type MarineOverrides = Partial<
  Record<MarineObservation, Partial<Record<number, number | null>>>
>;

function marineForecast(
  overrides: MarineOverrides = {},
): SourceForecast<MarineObservation> {
  const defaults: Record<MarineObservation, number> = {
    waveHeight: 1.2,
    swellPeriod: 12,
    wavePeriod: 11,
  };
  return {
    localTimestamps: hours().map(
      (hour) => `${date}T${String(hour).padStart(2, "0")}:00`,
    ),
    observations: Object.fromEntries(
      (Object.keys(defaults) as MarineObservation[]).map((key) => [
        key,
        hours().map((hour) =>
          overrides[key] !== undefined && hour in overrides[key]!
            ? overrides[key]![hour]!
            : defaults[key],
        ),
      ]),
    ) as Record<MarineObservation, (number | null)[]>,
  };
}

function allHours(value: number | null): Partial<Record<number, number | null>> {
  return Object.fromEntries(hours().map((hour) => [hour, value]));
}

function retainHours<Observation extends string>(
  forecast: SourceForecast<Observation>,
  retainedHours: readonly number[],
): SourceForecast<Observation> {
  const retainedIndexes = forecast.localTimestamps.flatMap((timestamp, index) =>
    retainedHours.includes(Number(timestamp.slice(11, 13))) ? [index] : [],
  );

  return {
    localTimestamps: retainedIndexes.map((index) => forecast.localTimestamps[index]!),
    observations: Object.fromEntries(
      Object.entries(forecast.observations).map(([key, values]) => [
        key,
        retainedIndexes.map((index) => (values as readonly (number | null)[])[index]!),
      ]),
    ) as Record<Observation, (number | null)[]>,
    ...(forecast.solarDays === undefined ? {} : { solarDays: forecast.solarDays }),
  };
}

function hours(): number[] {
  return Array.from({ length: 24 }, (_, hour) => hour);
}
