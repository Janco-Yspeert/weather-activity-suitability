import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { SqliteForecastStore } from "../src/storage.js";
import type { ResolvedLocation, SourceForecast } from "../src/open-meteo.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true })));
});

const location: ResolvedLocation = {
  id: "3369157",
  name: "Cape Town",
  latitude: -33.9258,
  longitude: 18.4232,
  timezone: "Africa/Johannesburg",
  countryCode: "ZA",
  country: "South Africa",
  admin1: "Western Cape",
};

const weather: SourceForecast = {
  localTimestamps: ["2026-09-07T12:00"],
  observations: {
    airTemperature: [18],
    apparentTemperature: [18],
    precipitation: [0],
    rain: [0],
    snowfall: [0],
    snowDepth: [0],
    windSpeed: [10],
    windGust: [15],
    visibility: [10_000],
    weatherCode: [0],
    cloudCover: [10],
  },
  solarDays: [{ date: "2026-09-07", sunrise: "2026-09-07T06:35", sunset: null }],
};

describe("SqliteForecastStore", () => {
  it("durably stores canonical aliases and application-owned snapshots", async () => {
    const directory = await mkdtemp(join(tmpdir(), "weather-store-"));
    directories.push(directory);
    const path = join(directory, "forecast.sqlite");
    const first = new SqliteForecastStore(path);
    first.saveLocationAlias("cape town", location);
    first.appendSnapshot({
      locationId: location.id,
      source: "WEATHER",
      fetchedAt: new Date("2026-09-06T10:00:00.000Z"),
      requestedFromDate: "2026-09-07",
      requestedThroughDate: "2026-09-13",
      forecast: weather,
    });
    first.close();

    const reopened = new SqliteForecastStore(path);
    expect(reopened.findLocationByAlias("cape town")).toEqual(location);
    expect(reopened.latestSnapshot(location.id, "WEATHER")).toEqual({
      locationId: location.id,
      source: "WEATHER",
      fetchedAt: new Date("2026-09-06T10:00:00.000Z"),
      requestedFromDate: "2026-09-07",
      requestedThroughDate: "2026-09-13",
      forecast: weather,
    });
    reopened.close();
  });

  it("keeps distinct aliases while sharing one canonical location", async () => {
    const directory = await mkdtemp(join(tmpdir(), "weather-store-"));
    directories.push(directory);
    const store = new SqliteForecastStore(join(directory, "forecast.sqlite"));
    store.saveLocationAlias("cape town", location);
    store.saveLocationAlias("cape town, western cape", location);

    expect(store.findLocationByAlias("cape town")).toEqual(location);
    expect(store.findLocationByAlias("cape town, western cape")).toEqual(location);
    expect(store.findLocationByAlias("cape town, south africa")).toBeNull();
    store.close();
  });

  it("rejects payloads that are not the application-owned source model", async () => {
    const directory = await mkdtemp(join(tmpdir(), "weather-store-"));
    directories.push(directory);
    const store = new SqliteForecastStore(join(directory, "forecast.sqlite"));
    store.saveLocationAlias("cape town", location);

    expect(() => store.appendSnapshot({
      locationId: location.id,
      source: "WEATHER",
      fetchedAt: new Date("2026-09-06T10:00:00.000Z"),
      requestedFromDate: "2026-09-07",
      requestedThroughDate: "2026-09-13",
      forecast: {
        localTimestamps: ["2026-09-07T12:00"],
        observations: { temperature_2m: [18] },
      },
    })).toThrow("Invalid weather observations");
    store.close();
  });

  it("never returns semantically invalid timestamps from stored application forecasts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "weather-store-"));
    directories.push(directory);
    const store = new SqliteForecastStore(join(directory, "forecast.sqlite"));
    store.saveLocationAlias("cape town", location);

    let rejectedOnWrite = false;
    try {
      store.appendSnapshot({
        locationId: location.id,
        source: "WEATHER",
        fetchedAt: new Date("2026-09-06T10:00:00.000Z"),
        requestedFromDate: "2026-09-07",
        requestedThroughDate: "2026-09-13",
        forecast: {
          ...weather,
          localTimestamps: ["2026-02-30T99:99"],
        },
      });
    } catch {
      rejectedOnWrite = true;
    }
    if (!rejectedOnWrite) {
      expect(() => store.latestSnapshot(location.id, "WEATHER")).toThrow(
        "Invalid stored forecast payload",
      );
    }
    store.close();
  });
});
