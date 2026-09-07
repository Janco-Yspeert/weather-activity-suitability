import { describe, expect, it } from "vitest";

import { getTargetDates } from "../../src/forecast-policy.js";
import { OpenMeteoClient } from "../../src/open-meteo.js";

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
  });

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
  });

  it("returns usable weather data covering the target forecast window", async () => {
    const location = await client.resolveLocation("Cape Town");
    const forecast = await client.fetchWeather(location, ["airTemperature"]);

    expect(forecast.localTimestamps.length).toBeGreaterThan(0);
    expect(forecast.observations.airTemperature.length).toBe(
      forecast.localTimestamps.length,
    );

    expect(
      forecast.observations.airTemperature.some((value) => value !== null),
    ).toBe(true);

    const targetDates = getTargetDates(new Date(), location.timezone);

    const returnedDates = new Set(
      forecast.localTimestamps.map((timestamp) => timestamp.slice(0, 10)),
    );

    for (const date of targetDates) {
      expect(returnedDates.has(date)).toBe(true);
    }
  });

  it("returns usable marine data for Cape Town", async () => {
    const location = await client.resolveLocation("Cape Town");
    const forecast = await client.fetchMarine(location, ["waveHeight"]);

    expect(forecast.localTimestamps.length).toBeGreaterThan(0);
    expect(forecast.observations.waveHeight.length).toBe(
      forecast.localTimestamps.length,
    );

    expect(
      forecast.observations.waveHeight.some((value) => value !== null),
    ).toBe(true);

    const targetDates = getTargetDates(new Date(), location.timezone);

    const datesWithMarineData = new Set(
      forecast.localTimestamps
        .filter((_, index) => forecast.observations.waveHeight[index] !== null)
        .map((timestamp) => timestamp.slice(0, 10)),
    );

    for (const date of targetDates) {
      expect(datesWithMarineData.has(date)).toBe(true);
    }
  });
});
