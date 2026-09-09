import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { ForecastService, type ForecastProvider } from "../src/forecast-service.js";
import { MemoryForecastStore, SqliteForecastStore } from "../src/storage.js";
import { ProviderRequestError, type ResolvedLocation, type SourceForecast } from "../src/open-meteo.js";

const location: ResolvedLocation = {
  id: "3369157", name: "Cape Town", latitude: -33.9258, longitude: 18.4232,
  timezone: "Africa/Johannesburg", countryCode: "ZA", country: "South Africa", admin1: "Western Cape",
};
const dates = ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13"];
const source = (
  observation: string,
  values: readonly (number | null)[] = dates.map(() => 1),
): SourceForecast => ({
  localTimestamps: dates.map((date) => `${date}T12:00`), observations: { [observation]: values },
});

const weatherSource = (airTemperature = 1): SourceForecast => ({
  localTimestamps: dates.map((date) => `${date}T12:00`),
  observations: {
    airTemperature: dates.map(() => airTemperature),
    apparentTemperature: dates.map(() => 1),
    precipitation: dates.map(() => 0),
    rain: dates.map(() => 0),
    snowfall: dates.map(() => 0),
    snowDepth: dates.map(() => 0),
    windSpeed: dates.map(() => 1),
    windGust: dates.map(() => 1),
    visibility: dates.map(() => 10_000),
    weatherCode: dates.map(() => 0),
    cloudCover: dates.map(() => 0),
  },
});

function provider(): ForecastProvider {
  return {
    resolveLocation: vi.fn(async () => location),
    fetchWeather: vi.fn(async () => weatherSource()),
    fetchMarine: vi.fn(async () => ({
      localTimestamps: dates.map((date) => `${date}T12:00`),
      observations: {
        waveHeight: dates.map(() => 1),
        swellPeriod: dates.map(() => 8),
        wavePeriod: dates.map(() => 8),
      },
    })),
  };
}

describe("persistent forecast lifecycle", () => {
  it("rechecks fallback age after a slow failed refresh", async () => {
    let now = new Date("2026-09-06T10:00:00Z");
    const forecastProvider = provider();
    const service = new ForecastService(forecastProvider, () => now);
    await service.assess("Cape Town");
    now = new Date("2026-09-07T09:59:59Z");
    const fail = async () => {
      now = new Date("2026-09-07T10:00:12Z");
      throw new ProviderRequestError("refresh timed out");
    };
    vi.mocked(forecastProvider.fetchWeather).mockImplementation(fail);
    vi.mocked(forecastProvider.fetchMarine).mockImplementation(fail);
    const result = await service.assess("Cape Town");
    expect(result.metadata.weather).toMatchObject({ state: "UNAVAILABLE", fetchedAt: null, stale: false });
    expect(result.metadata.marine).toMatchObject({ state: "UNAVAILABLE", fetchedAt: null, stale: false });
  });

  it("reuses a late-evening request across local midnight when its intended horizon includes the new final day", async () => {
    let now = new Date("2026-09-06T20:30:00.000Z");
    const store = new MemoryForecastStore();
    const forecastProvider = provider();
    forecastProvider.getRequestedThroughDate = vi.fn(() => "2026-09-14");
    const service = new ForecastService(forecastProvider, () => now, store);

    await service.assess("Cape Town");
    expect(store.latestSnapshot(location.id, "WEATHER")?.requestedThroughDate)
      .toBe("2026-09-14");

    now = new Date("2026-09-06T22:30:00.000Z");
    const afterMidnight = await service.assess("Cape Town");

    expect(afterMidnight.dates.at(-1)).toBe("2026-09-14");
    expect(forecastProvider.fetchWeather).toHaveBeenCalledTimes(1);
    expect(forecastProvider.fetchMarine).toHaveBeenCalledTimes(1);
    expect(afterMidnight.metadata.weather.state).toBe("PARTIAL");
  });

  it("reuses aliases and both source snapshots after a real SQLite restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "weather-restart-"));
    const path = join(directory, "forecast.sqlite");
    try {
      const firstProvider = provider();
      const firstStore = new SqliteForecastStore(path);
      await new ForecastService(firstProvider, () => new Date("2026-09-06T10:00:00.000Z"), firstStore)
        .assess("Cape Town");
      firstStore.close();

      const restartedProvider = provider();
      const restartedStore = new SqliteForecastStore(path);
      const result = await new ForecastService(restartedProvider, () => new Date("2026-09-06T11:00:00.000Z"), restartedStore)
        .assess(" CAPE TOWN ");
      expect(result.metadata.weather.state).toBe("AVAILABLE");
      expect(restartedProvider.resolveLocation).not.toHaveBeenCalled();
      expect(restartedProvider.fetchWeather).not.toHaveBeenCalled();
      expect(restartedProvider.fetchMarine).not.toHaveBeenCalled();
      restartedStore.close();
    } finally {
      await rm(directory, { recursive: true });
    }
  });

  it("overwrites the current weather snapshot with a fresh generation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "weather-refresh-"));
    const path = join(directory, "forecast.sqlite");
    const store = new SqliteForecastStore(path);
    try {
      let now = new Date("2026-09-06T10:00:00.000Z");
      const forecastProvider = provider();
      const service = new ForecastService(forecastProvider, () => now, store);

      await service.assess("Cape Town");

      vi.mocked(forecastProvider.fetchWeather).mockResolvedValue(
        weatherSource(27),
      );
      now = new Date("2026-09-06T13:00:00.000Z");

      const result = await service.assess("Cape Town");

      expect(forecastProvider.fetchWeather).toHaveBeenCalledTimes(2);
      expect(result.metadata.weather).toMatchObject({
        fetchedAt: "2026-09-06T13:00:00.000Z",
        stale: false,
      });
      expect(
        store.latestSnapshot(location.id, "WEATHER")?.forecast.observations
          .airTemperature,
      ).toEqual(dates.map(() => 27));

      const inspection = new DatabaseSync(path, { readOnly: true });
      try {
        expect(
          inspection
            .prepare(
              "SELECT COUNT(*) AS count FROM source_snapshot WHERE location_id = ? AND source = 'WEATHER'",
            )
            .get(location.id),
        ).toEqual({ count: 1 });
      } finally {
        inspection.close();
      }
    } finally {
      store.close();
      await rm(directory, { recursive: true });
    }
  });

  it("reuses normalized aliases and fresh partial snapshots without provider calls", async () => {
    const store = new MemoryForecastStore();
    const firstProvider = provider();
    vi.mocked(firstProvider.fetchWeather).mockResolvedValue({
      localTimestamps: dates.slice(0, 2).map((date) => `${date}T12:00`),
      observations: { airTemperature: [1, 1] },
    } as never);
    vi.mocked(firstProvider.fetchMarine).mockResolvedValue(source(
      "waveHeight",
      dates.map(() => null),
    ) as never);
    const first = new ForecastService(firstProvider, () => new Date("2026-09-06T10:00:00.000Z"), store);
    await first.assess(" Cape Town ");

    const restartedProvider = provider();
    const restarted = new ForecastService(restartedProvider, () => new Date("2026-09-06T11:00:00.000Z"), store);
    const result = await restarted.assess("cape town");

    expect(restartedProvider.resolveLocation).not.toHaveBeenCalled();
    expect(restartedProvider.fetchWeather).not.toHaveBeenCalled();
    expect(restartedProvider.fetchMarine).not.toHaveBeenCalled();
    expect(result.metadata.weather).toMatchObject({ state: "PARTIAL", stale: false, fetchedAt: "2026-09-06T10:00:00.000Z" });
    expect(result.metadata.marine).toMatchObject({ state: "NO_DATA", stale: false });
  });

  it("refreshes sources independently and uses only eligible stale fallback", async () => {
    const store = new MemoryForecastStore();
    const initial = provider();
    await new ForecastService(initial, () => new Date("2026-09-06T10:00:00.000Z"), store).assess("Cape Town");
    const next = provider();
    vi.mocked(next.fetchWeather).mockResolvedValue(source("airTemperature", dates.map(() => 2)) as never);
    vi.mocked(next.fetchMarine).mockRejectedValue(new ProviderRequestError("marine failed"));

    const result = await new ForecastService(next, () => new Date("2026-09-06T13:00:00.000Z"), store).assess("Cape Town");

    expect(result.metadata.weather).toMatchObject({ stale: false, fetchedAt: "2026-09-06T13:00:00.000Z" });
    expect(result.metadata.marine).toMatchObject({ stale: true, fetchedAt: "2026-09-06T10:00:00.000Z" });
  });

  it("rejects fallback older than 24 hours after a failed refresh", async () => {
    const store = new MemoryForecastStore();
    await new ForecastService(provider(), () => new Date("2026-09-06T10:00:00.000Z"), store).assess("Cape Town");
    const failing = provider();
    vi.mocked(failing.fetchWeather).mockRejectedValue(new ProviderRequestError("weather failed"));
    vi.mocked(failing.fetchMarine).mockRejectedValue(new ProviderRequestError("marine failed"));

    const result = await new ForecastService(failing, () => new Date("2026-09-07T10:00:00.001Z"), store).assess("Cape Town");
    expect(result.metadata.weather).toMatchObject({ state: "UNAVAILABLE", fetchedAt: null, stale: false });
    expect(result.metadata.marine).toMatchObject({ state: "UNAVAILABLE", fetchedAt: null, stale: false });
  });

  it("propagates persistence writes instead of reporting an ephemeral refresh", async () => {
    const store = new MemoryForecastStore();
    store.saveSnapshot = () => { throw new Error("disk full"); };
    await expect(new ForecastService(provider(), () => new Date("2026-09-06T10:00:00.000Z"), store).assess("Cape Town"))
      .rejects.toThrow("disk full");
  });
});
