import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApplication } from "../src/application.js";
import type { ForecastProvider } from "../src/forecast-service.js";
import { createGraphqlServer } from "../src/http-server.js";
import type { SourceForecast } from "../src/open-meteo.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => Promise.all(cleanups.splice(0).map((cleanup) => cleanup())));

describe("runnable GraphQL server", () => {
  it("serves forecast queries against a configured SQLite file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "weather-http-"));
    const provider: ForecastProvider = {
      resolveLocation: vi.fn(async () => ({
        id: "2950159", name: "Berlin", latitude: 52.52, longitude: 13.41,
        timezone: "Europe/Berlin", countryCode: "DE",
      })),
      fetchWeather: vi.fn(async () => ({
        localTimestamps: [],
        observations: {
          airTemperature: [], apparentTemperature: [], precipitation: [], rain: [],
          snowfall: [], snowDepth: [], windSpeed: [], windGust: [], visibility: [],
          weatherCode: [], cloudCover: [],
        },
      }) as SourceForecast),
      fetchMarine: vi.fn(async () => ({
        localTimestamps: [],
        observations: { waveHeight: [], swellPeriod: [], wavePeriod: [] },
      }) as SourceForecast),
    };
    const app = createApplication({
      databasePath: join(directory, "forecast.sqlite"),
      provider,
      clock: () => new Date("2026-09-06T10:00:00.000Z"),
    });
    const server = createGraphqlServer(app.schema);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });
    cleanups.push(async () => {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      app.close();
      await rm(directory, { recursive: true });
    });
    const { port } = server.address() as AddressInfo;

    const response = await fetch(`http://127.0.0.1:${port}/graphql`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `query($place: String!) {
          forecast(location: $place) {
            location { name }
            metadata { weather { state coveredDates fetchedAt stale } }
            skiing surfing outdoorSightseeing indoorSightseeing
            dailyAdvisories { date codes }
            forecastAdvisories
          }
        }`,
        variables: { place: "Berlin" },
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { forecast: {
        location: { name: "Berlin" },
        metadata: { weather: {
          state: "NO_DATA", coveredDates: [],
          fetchedAt: "2026-09-06T10:00:00.000Z", stale: false,
        } },
        skiing: Array(7).fill("UNKNOWN"),
        surfing: Array(7).fill("UNKNOWN"),
        outdoorSightseeing: Array(7).fill("UNKNOWN"),
        indoorSightseeing: Array(7).fill("UNKNOWN"),
        dailyAdvisories: [],
        forecastAdvisories: [],
      } },
    });
  });
});
