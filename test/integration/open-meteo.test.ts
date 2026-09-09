import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { graphql } from "graphql";
import { describe, expect, it } from "vitest";

import { createApplication } from "../../src/application.js";
import { getTargetDates } from "../../src/forecast-policy.js";
import {
  OpenMeteoClient,
  type ResolvedLocation,
} from "../../src/open-meteo.js";

const capeTown: ResolvedLocation = {
  id: "3369157",
  name: "Cape Town",
  latitude: -33.92584,
  longitude: 18.42322,
  timezone: "Africa/Johannesburg",
  countryCode: "ZA",
  country: "South Africa",
  admin1: "Western Cape",
};

describe("Open-Meteo live integration", () => {
  const client = new OpenMeteoClient();

  it("resolves Cape Town to the expected canonical place", async () => {
    const location = await client.resolveLocation("Cape Town");

    expect(location).toMatchObject({
      id: "3369157",
      name: "Cape Town",
      timezone: "Africa/Johannesburg",
      countryCode: "ZA",
      country: "South Africa",
      admin1: "Western Cape",
    });

    expect(location.latitude).toBeGreaterThan(-35);
    expect(location.latitude).toBeLessThan(-33);
    expect(location.longitude).toBeGreaterThan(18);
    expect(location.longitude).toBeLessThan(19);
  }, 20_000);

  it("resolves Kaapstad (Afrikaans) to the expected canonical place", async () => {
    const location = await client.resolveLocation("Kaapstad");

    expect(location).toMatchObject({
      id: "3369157",
      name: "Cape Town",
      timezone: "Africa/Johannesburg",
      countryCode: "ZA",
      country: "South Africa",
      admin1: "Western Cape",
    });

    expect(location.latitude).toBeGreaterThan(-35);
    expect(location.latitude).toBeLessThan(-33);
    expect(location.longitude).toBeGreaterThan(18);
    expect(location.longitude).toBeLessThan(19);
  }, 20_000);

  it("returns usable weather data covering the target forecast window", async () => {
    const forecast = await client.fetchWeather(capeTown, [
      "airTemperature",
      "apparentTemperature",
      "precipitation",
      "rain",
      "snowfall",
      "snowDepth",
      "windSpeed",
      "windGust",
      "visibility",
      "weatherCode",
      "cloudCover",
    ]);

    expect(forecast.localTimestamps.length).toBeGreaterThan(0);
    expect(forecast.observations.airTemperature.length).toBe(
      forecast.localTimestamps.length,
    );

    expect(
      forecast.observations.airTemperature.some((value) => value !== null),
    ).toBe(true);

    const targetDates = getTargetDates(new Date(), capeTown.timezone);

    const returnedDates = new Set(
      forecast.localTimestamps.map((timestamp) => timestamp.slice(0, 10)),
    );

    for (const date of targetDates) {
      expect(returnedDates.has(date)).toBe(true);
      expect(forecast.solarDays?.some((day) => day.date === date)).toBe(true);
    }
  }, 20_000);

  it("returns usable marine data for Cape Town", async () => {
    const forecast = await client.fetchMarine(capeTown, [
      "waveHeight",
      "swellPeriod",
      "wavePeriod",
    ]);

    expect(forecast.localTimestamps.length).toBeGreaterThan(0);
    expect(forecast.observations.waveHeight.length).toBe(
      forecast.localTimestamps.length,
    );

    expect(
      forecast.observations.waveHeight.some((value) => value !== null),
    ).toBe(true);
    expect(forecast.observations.swellPeriod).toHaveLength(
      forecast.localTimestamps.length,
    );
    expect(forecast.observations.wavePeriod).toHaveLength(
      forecast.localTimestamps.length,
    );

    const targetDates = getTargetDates(new Date(), capeTown.timezone);

    const datesWithMarineData = new Set(
      forecast.localTimestamps
        .filter((_, index) => forecast.observations.waveHeight[index] !== null)
        .map((timestamp) => timestamp.slice(0, 10)),
    );

    for (const date of targetDates) {
      expect(datesWithMarineData.has(date)).toBe(true);
    }
  }, 20_000);

  it("assesses Cape Town through the composed Open-Meteo forecast path", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "weather-live-application-"),
    );
    const app = createApplication({
      databasePath: join(directory, "forecast.sqlite"),
    });
    try {
      const result = await graphql({
        schema: app.schema,
        source: `
          query {
            forecast(location: "Cape Town") {
              location { id name timezone }
              dates
              skiing
              surfing
              outdoorSightseeing
              indoorSightseeing
              metadata {
                weather { state coveredDates fetchedAt stale }
                marine { state coveredDates fetchedAt stale }
              }
            }
          }
        `,
      });

      expect(result.errors).toBeUndefined();
      const forecast = result.data?.forecast as {
        location: { id: string; name: string; timezone: string };
        dates: string[];
        skiing: string[];
        surfing: string[];
        outdoorSightseeing: string[];
        indoorSightseeing: string[];
        metadata: {
          weather: {
            state: string;
            coveredDates: string[];
            fetchedAt: string | null;
            stale: boolean;
          };
          marine: {
            state: string;
            coveredDates: string[];
            fetchedAt: string | null;
            stale: boolean;
          };
        };
      };
      expect(forecast.location).toMatchObject({
        id: "3369157",
        name: "Cape Town",
        timezone: "Africa/Johannesburg",
      });
      expect(forecast.dates).toEqual(
        getTargetDates(new Date(), forecast.location.timezone),
      );

      const ratings = new Set([
        "UNKNOWN",
        "UNSUITABLE",
        "POOR",
        "FAIR",
        "GOOD",
        "EXCELLENT",
      ]);
      for (const activity of [
        forecast.skiing,
        forecast.surfing,
        forecast.outdoorSightseeing,
        forecast.indoorSightseeing,
      ]) {
        expect(activity).toHaveLength(7);
        expect(activity.every((rating) => ratings.has(rating))).toBe(true);
      }

      for (const source of [
        forecast.metadata.weather,
        forecast.metadata.marine,
      ]) {
        expect(source.state).toBe("AVAILABLE");
        expect(source.coveredDates).toEqual(forecast.dates);
        expect(source.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(source.stale).toBe(false);
      }
    } finally {
      app.close();
      await rm(directory, { recursive: true });
    }
  }, 30_000);
});
