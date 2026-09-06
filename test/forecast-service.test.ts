import { describe, expect, it, vi } from "vitest";

import { ForecastService, type ForecastProvider } from "../src/forecast-service.js";
import { ProviderResponseError, type ResolvedLocation, type SourceForecast } from "../src/open-meteo.js";

const capeTown: ResolvedLocation = {
  id: "3369157",
  name: "Cape Town",
  latitude: -33.9258,
  longitude: 18.4232,
  timezone: "Africa/Johannesburg",
  countryCode: "ZA",
  country: "South Africa",
  admin1: "Western Cape",
};

const targetDates = [
  "2026-09-07",
  "2026-09-08",
  "2026-09-09",
  "2026-09-10",
  "2026-09-11",
  "2026-09-12",
  "2026-09-13",
];

function sourceForecast(
  observation: string,
  dates: readonly string[] = targetDates,
  values: readonly (number | null)[] = dates.map(() => 1),
): SourceForecast {
  return {
    localTimestamps: dates.map((date) => `${date}T00:00`),
    observations: { [observation]: values },
  };
}

describe("ForecastService", () => {
  it("reports independent source availability and aligned UNKNOWN placeholders", async () => {
    const fetchWeather = vi.fn(async () =>
      sourceForecast("airTemperature", ["2026-09-06", ...targetDates, "2026-09-14"]),
    );
    const fetchMarine = vi.fn(async () =>
      sourceForecast(
        "waveHeight",
        ["2026-09-07", "2026-09-08", "2026-09-09"],
        [1.2, null, 1.8],
      ),
    );
    const provider: ForecastProvider = {
      resolveLocation: vi.fn(async () => capeTown),
      fetchWeather,
      fetchMarine,
    };
    const service = new ForecastService(provider, () => new Date("2026-09-06T10:00:00.000Z"));

    const result = await service.assess("Cape Town");

    expect(result.location).toEqual(capeTown);
    expect(result.dates).toEqual(targetDates);
    expect(result.metadata).toEqual({
      weather: { state: "AVAILABLE", coveredDates: targetDates },
      marine: { state: "PARTIAL", coveredDates: ["2026-09-07", "2026-09-09"] },
    });
    expect(fetchWeather).toHaveBeenCalledWith(capeTown, ["airTemperature"]);
    expect(fetchMarine).toHaveBeenCalledWith(capeTown, ["waveHeight"]);
    expect(result.skiing).toEqual(Array(7).fill("UNKNOWN"));
    expect(result.surfing).toEqual(result.skiing);
    expect(result.outdoorSightseeing).toEqual(result.skiing);
    expect(result.indoorSightseeing).toEqual(result.skiing);
  });

  it("keeps ratings UNKNOWN and marks marine UNAVAILABLE when its boundary fails", async () => {
    const provider: ForecastProvider = {
      resolveLocation: vi.fn(async () => capeTown),
      fetchWeather: vi.fn(async () => sourceForecast("airTemperature")),
      fetchMarine: vi.fn(async () => {
        throw new ProviderResponseError("Malformed Open-Meteo response at hourly.wave_height");
      }),
    };
    const service = new ForecastService(provider, () => new Date("2026-09-06T10:00:00.000Z"));

    await expect(service.assess("Cape Town")).resolves.toMatchObject({
      metadata: {
        weather: { state: "AVAILABLE", coveredDates: targetDates },
        marine: { state: "UNAVAILABLE", coveredDates: [] },
      },
      surfing: Array(7).fill("UNKNOWN"),
    });
  });

  it("marks successful all-null marine data NO_DATA without scoring it in this spike", async () => {
    const provider: ForecastProvider = {
      resolveLocation: vi.fn(async () => capeTown),
      fetchWeather: vi.fn(async () => sourceForecast("airTemperature")),
      fetchMarine: vi.fn(async () => sourceForecast("waveHeight", targetDates, targetDates.map(() => null))),
    };
    const service = new ForecastService(provider, () => new Date("2026-09-06T10:00:00.000Z"));

    const result = await service.assess("Cape Town");

    expect(result.metadata.weather).toEqual({ state: "AVAILABLE", coveredDates: targetDates });
    expect(result.metadata.marine).toEqual({ state: "NO_DATA", coveredDates: [] });
    expect(result.surfing).toEqual(Array(7).fill("UNKNOWN"));
  });

  it("coalesces simultaneous two-source refreshes by canonical location identity", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const provider: ForecastProvider = {
      resolveLocation: vi.fn(async () => capeTown),
      fetchWeather: vi.fn(async () => {
        await gate;
        return sourceForecast("airTemperature");
      }),
      fetchMarine: vi.fn(async () => {
        await gate;
        return sourceForecast("waveHeight");
      }),
    };
    const service = new ForecastService(provider, () => new Date("2026-09-06T10:00:00.000Z"));

    const first = service.assess("Cape Town");
    const second = service.assess("Kaapstad");
    await vi.waitFor(() => {
      expect(provider.fetchWeather).toHaveBeenCalledTimes(1);
      expect(provider.fetchMarine).toHaveBeenCalledTimes(1);
    });
    release();

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult.metadata).toEqual(secondResult.metadata);
  });

  it("does not coalesce distinct canonical locations", async () => {
    const provider: ForecastProvider = {
      resolveLocation: vi.fn(async (query) =>
        query === "Cape Town" ? capeTown : { ...capeTown, id: "964137", name: "Pretoria" },
      ),
      fetchWeather: vi.fn(async () => sourceForecast("airTemperature")),
      fetchMarine: vi.fn(async () => sourceForecast("waveHeight")),
    };
    const service = new ForecastService(provider, () => new Date("2026-09-06T10:00:00.000Z"));

    await Promise.all([service.assess("Cape Town"), service.assess("Pretoria")]);

    expect(provider.fetchWeather).toHaveBeenCalledTimes(2);
    expect(provider.fetchMarine).toHaveBeenCalledTimes(2);
  });

  it("releases a degraded in-flight refresh so the next request retries both sources", async () => {
    const fetchWeather = vi
      .fn<ForecastProvider["fetchWeather"]>()
      .mockRejectedValueOnce(new Error("weather failed"))
      .mockResolvedValueOnce(sourceForecast("airTemperature"));
    const fetchMarine = vi
      .fn<ForecastProvider["fetchMarine"]>()
      .mockRejectedValueOnce(new Error("marine failed"))
      .mockResolvedValueOnce(sourceForecast("waveHeight"));
    const provider: ForecastProvider = {
      resolveLocation: vi.fn(async () => capeTown),
      fetchWeather,
      fetchMarine,
    };
    const service = new ForecastService(provider, () => new Date("2026-09-06T10:00:00.000Z"));

    const degraded = await service.assess("Cape Town");
    expect(degraded.metadata.weather.state).toBe("UNAVAILABLE");
    expect(degraded.metadata.marine.state).toBe("UNAVAILABLE");

    const retried = await service.assess("Cape Town");
    expect(retried.metadata.weather.state).toBe("AVAILABLE");
    expect(retried.metadata.marine.state).toBe("AVAILABLE");
    expect(fetchWeather).toHaveBeenCalledTimes(2);
    expect(fetchMarine).toHaveBeenCalledTimes(2);
  });
});
