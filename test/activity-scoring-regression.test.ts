import { describe, expect, it } from "vitest";
import { ForecastService } from "../src/forecast-service.js";
import { scoreActivities } from "../src/activity-scoring.js";
import type {
  MarineObservation,
  SourceForecast,
  WeatherObservation,
} from "../src/open-meteo.js";

const date = "2026-09-08";
const hours = Array.from({ length: 24 }, (_, hour) => hour);
const weatherDefaults = {
  airTemperature: 0,
  apparentTemperature: 22,
  precipitation: 0,
  rain: 0,
  snowfall: 0,
  snowDepth: 0.4,
  windSpeed: 8,
  windGust: 12,
  visibility: 12_000,
  weatherCode: 0,
  cloudCover: 10,
};
const marineDefaults = { waveHeight: 1.2, swellPeriod: 12, wavePeriod: 11 };

function forecast<K extends string>(
  values: Record<K, number | null>,
  retained = hours,
): SourceForecast<K> {
  return {
    localTimestamps: retained.map(
      (hour) => `${date}T${String(hour).padStart(2, "0")}:00`,
    ),
    observations: Object.fromEntries(
      Object.entries(values).map(([key, value]) => [
        key,
        retained.map(() => value),
      ]),
    ) as Record<K, (number | null)[]>,
    solarDays: [{ date, sunrise: `${date}T06:00`, sunset: `${date}T18:00` }],
  };
}

async function assess(
  weather: SourceForecast<WeatherObservation>,
  marine: SourceForecast<MarineObservation>,
) {
  const service = new ForecastService(
    {
      resolveLocation: async () => ({
        id: "test",
        name: "Test",
        latitude: 0,
        longitude: 0,
        timezone: "UTC",
        countryCode: "ZA",
        country: "South Africa",
      }),
      fetchWeather: async () => weather,
      fetchMarine: async () => marine,
    },
    () => new Date("2026-09-07T12:00:00Z"),
  );
  const result = await service.assess("Test");
  expect(result.dates[0]).toBe(date);
  for (const key of [
    "skiing",
    "surfing",
    "outdoorSightseeing",
    "indoorSightseeing",
  ] as const) {
    expect(result[key]).toHaveLength(7);
  }
  return result;
}

// Fixed expectations from EVAL-02/05/07; the service seam survives module changes.
describe("unchanged evaluator contract", () => {
  it.each([
    [[3, 4], 45, "GOOD"],
    [[10], 45, "GOOD"],
    [[9, 11], 45, "GOOD"],
    [[10, 11], 44.9, "GOOD"],
    [[10, 11], 45, "UNSUITABLE"],
    [[10, 11], -29.9, "GOOD"],
    [[10, 11], -30, "UNSUITABLE"],
  ] as const)(
    "global temperature at %j, %s → indoor %s",
    async (affected, temperature, expected) => {
      const weather = forecast(weatherDefaults);
      const result = await assess(
        {
          ...weather,
          observations: {
            ...weather.observations,
            apparentTemperature: hours.map((hour) =>
              (affected as readonly number[]).includes(hour) ? temperature : 22,
            ),
          },
        },
        forecast(marineDefaults),
      );
      expect(result.indoorSightseeing[0]).toBe(expected);
    },
  );

  it("does not combine weather and marine from different timestamps", async () => {
    const result = await assess(
      forecast(weatherDefaults, [9, 10]),
      forecast(marineDefaults, [11, 12]),
    );
    expect(result.surfing[0]).toBe("UNKNOWN");
  });

  it("retains non-null marine evidence beyond the target dates", async () => {
    const empty = forecast({
      waveHeight: null,
      swellPeriod: null,
      wavePeriod: null,
    });
    const result = await assess(forecast(weatherDefaults), {
      localTimestamps: [...empty.localTimestamps, "2026-09-16T09:00"],
      observations: {
        waveHeight: [...hours.map(() => null), 1.2],
        swellPeriod: [...hours.map(() => null), 12],
        wavePeriod: [...hours.map(() => null), 11],
      },
    });
    expect(result.surfing[0]).toBe("UNKNOWN");
  });

  it.each([
    { windGust: 93 },
    { weatherCode: 67 },
    { weatherCode: 99 },
    { apparentTemperature: 45 },
    { apparentTemperature: -30 },
    { snowfall: 1, visibility: 400, windGust: 56 },
  ])("preserves global precedence for %j", async (override) => {
    const result = await assess(
      forecast({ ...weatherDefaults, ...override }),
      forecast(marineDefaults),
    );
    for (const key of [
      "skiing",
      "surfing",
      "outdoorSightseeing",
      "indoorSightseeing",
    ] as const) {
      expect(result[key][0]).toBe("UNSUITABLE");
    }
  });

  it.each([
    [1.2, 12, 8, [9], "UNKNOWN"],
    [1.2, 12, 8, [9, 10], "GOOD"],
    [0.7, 12, 8, [9, 10], "FAIR"],
    [0.7, 12, 8, [9, 10, 11], "GOOD"],
    [0.7, 6, 25, [9, 10], "FAIR"],
    [1.2, 12, 8, [8, 9, 10, 11], "GOOD"],
    [1.2, 12, 8, [9, 11], "UNKNOWN"],
    [4, 12, 8, [9, 10], "UNKNOWN"],
    [0.7, 12, 8, [8, 9, 12, 13], "FAIR"],
  ] as const)(
    "surf %s/%s/%s at %j → %s",
    async (waveHeight, swellPeriod, windSpeed, retained, expected) => {
      const result = await assess(
        forecast({ ...weatherDefaults, windSpeed }),
        forecast({ waveHeight, swellPeriod, wavePeriod: swellPeriod }, [
          ...retained,
        ]),
      );
      expect(result.surfing[0]).toBe(expected);
    },
  );

  it.each([
    [0, "UNKNOWN"],
    [0.01, "UNKNOWN"],
    [0.05, "FAIR"],
    [0.15, "GOOD"],
    [0.3, "GOOD"],
  ] as const)("partial ski snow %s → %s", async (snowDepth, expected) => {
    const result = await assess(
      forecast({ ...weatherDefaults, snowDepth }, [8, 9, 10, 11]),
      forecast(marineDefaults),
    );
    expect(result.skiing[0]).toBe(expected);
  });

  it.each([
    [[8, 9, 10], "UNKNOWN"],
    [[8, 9, 11, 12], "UNKNOWN"],
    [[8, 9, 10, 11], "FAIR"],
    [[8, 9, 10, 11, 12, 13], "FAIR"],
    [[8, 9, 10, 11, 12, 13, 14], "GOOD"],
  ] as const)("GOOD ski hours at %j → %s", async (retained, expected) => {
    const result = await assess(
      forecast(
        { ...weatherDefaults, airTemperature: 9, snowfall: 2, windSpeed: 25 },
        [...retained],
      ),
      forecast(marineDefaults),
    );
    expect(result.skiing[0]).toBe(expected);
  });
});

// Captured before the refactor. This protects combinations of caps, optional
// evidence and coverage as well as the explicit contract examples above.
it("preserves baseline ratings across calibration boundaries and evidence gaps", () => {
  const cases: string[] = [];
  function record(
    label: string,
    weather: SourceForecast<WeatherObservation>,
    marine: SourceForecast<MarineObservation>,
  ) {
    const result = scoreActivities(weather, marine, [date]);
    cases.push(
      `${label}: ski=${result.skiing[0]} surf=${result.surfing[0]} outdoor=${result.outdoorSightseeing[0]} indoor=${result.indoorSightseeing[0]}`,
    );
  }
  const boundaries: Partial<Record<WeatherObservation, (number | null)[]>> = {
    airTemperature: [-21, -20, -15, -10, -5, 3, 7, 7.1, 10, 10.1, 15, 16],
    apparentTemperature: [-30, -29, -1, 0, 5, 12, 18, 27, 32, 36, 40, 44, 45],
    precipitation: [0.1, 0.2, 0.4, 0.5, 1, 1.5, 2, 2.1, 4],
    rain: [0, 0.1, 0.5, 0.6, 2, 2.1],
    snowDepth: [0, 0.01, 0.05, 0.1, 0.15, 0.3],
    snowfall: [0, 0.5, 1.5, 3, 5, 5.1],
    windSpeed: [10, 12, 20, 30, 35, 40, 50],
    windGust: [56, 69, 70, 79, 80, 92, 93],
    visibility: [199, 200, 400, 499, 500, 999, 1000, 2000, 5000, 10000],
    weatherCode: [66, 67, 95, 96, 99],
    cloudCover: [24, 25, 50, 51, 75, 76],
  };
  for (const key of Object.keys(weatherDefaults) as WeatherObservation[]) {
    for (const value of [...boundaries[key]!, null, NaN, Infinity]) {
      record(
        `${key}=${value}`,
        forecast({ ...weatherDefaults, [key]: value }),
        forecast(marineDefaults),
      );
    }
  }
  for (const waveHeight of [0.2, 0.3, 0.6, 0.9, 1.8, 2.5, 3, 3.5, 4]) {
    for (const swellPeriod of [4, 5, 7, 9, 12]) {
      record(
        `wave=${waveHeight}/${swellPeriod}`,
        forecast(weatherDefaults),
        forecast({ ...marineDefaults, waveHeight, swellPeriod }),
      );
    }
  }
  for (const retained of [
    [8],
    [8, 9],
    [8, 9, 10],
    [8, 9, 10, 11],
    [8, 9, 11, 12],
    [8, 9, 10, 11, 12, 13],
    [8, 9, 10, 11, 12, 13, 14],
    hours,
  ]) {
    for (const snowDepth of [0, 0.01, 0.05, 0.15, 0.3]) {
      record(
        `hours=${retained.join(",")} snow=${snowDepth}`,
        forecast({ ...weatherDefaults, snowDepth }, retained),
        forecast(marineDefaults, retained),
      );
    }
  }
  expect(cases.join("\n")).toMatchSnapshot();
});
