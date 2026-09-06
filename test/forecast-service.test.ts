import { describe, expect, it, vi } from "vitest";

import { ForecastService, type ForecastProvider } from "../src/forecast-service.js";
import type { ResolvedLocation } from "../src/open-meteo.js";

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

describe("ForecastService", () => {
  it("returns the resolved location, coverage, seven dates, and aligned UNKNOWN placeholders", async () => {
    const provider: ForecastProvider = {
      resolveLocation: vi.fn(async () => capeTown),
      fetchForecast: vi.fn(async () => ({
        localTimestamps: ["2026-09-07T00:00", "2026-09-08T00:00", "2026-09-09T00:00"],
      })),
    };
    const service = new ForecastService(provider, () => new Date("2026-09-06T10:00:00.000Z"));

    const result = await service.assess("Cape Town");

    expect(result.location).toEqual(capeTown);
    expect(result.dates).toEqual([
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
    ]);
    expect(result.metadata).toEqual({
      fetchedAt: "2026-09-06T10:00:00.000Z",
      forecastCoveredDates: ["2026-09-07", "2026-09-08", "2026-09-09"],
      hasRequiredCoverage: false,
    });
    expect(result.skiing).toEqual(Array(7).fill("UNKNOWN"));
    expect(result.surfing).toEqual(result.skiing);
    expect(result.outdoorSightseeing).toEqual(result.skiing);
    expect(result.indoorSightseeing).toEqual(result.skiing);
  });

  it("coalesces simultaneous refreshes by canonical location identity", async () => {
    let completeFetch!: (value: { localTimestamps: string[] }) => void;
    const provider: ForecastProvider = {
      resolveLocation: vi.fn(async () => capeTown),
      fetchForecast: vi.fn(
        (_location: ResolvedLocation) =>
          new Promise<{ localTimestamps: string[] }>((resolve) => {
            completeFetch = resolve;
          }),
      ),
    };
    const service = new ForecastService(provider, () => new Date("2026-09-06T10:00:00.000Z"));

    const first = service.assess("Cape Town");
    const second = service.assess("Kaapstad");
    await vi.waitFor(() => expect(provider.fetchForecast).toHaveBeenCalledTimes(1));
    completeFetch({ localTimestamps: ["2026-09-07T00:00"] });

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult.metadata).toEqual(secondResult.metadata);
  });

  it("does not coalesce distinct canonical locations", async () => {
    const provider: ForecastProvider = {
      resolveLocation: vi.fn(async (query) =>
        query === "Cape Town" ? capeTown : { ...capeTown, id: "964137", name: "Pretoria" },
      ),
      fetchForecast: vi.fn(async () => ({ localTimestamps: ["2026-09-07T00:00"] })),
    };
    const service = new ForecastService(provider, () => new Date("2026-09-06T10:00:00.000Z"));

    await Promise.all([service.assess("Cape Town"), service.assess("Pretoria")]);

    expect(provider.fetchForecast).toHaveBeenCalledTimes(2);
  });

  it("releases a failed in-flight refresh so the next request can retry", async () => {
    const fetchForecast = vi
      .fn<ForecastProvider["fetchForecast"]>()
      .mockRejectedValueOnce(new Error("provider fell into the sea"))
      .mockResolvedValueOnce({ localTimestamps: ["2026-09-07T00:00"] });
    const provider: ForecastProvider = {
      resolveLocation: vi.fn(async () => capeTown),
      fetchForecast,
    };
    const service = new ForecastService(provider, () => new Date("2026-09-06T10:00:00.000Z"));

    await expect(service.assess("Cape Town")).rejects.toThrow("provider fell into the sea");
    await expect(service.assess("Cape Town")).resolves.toBeDefined();
    expect(fetchForecast).toHaveBeenCalledTimes(2);
  });
});
