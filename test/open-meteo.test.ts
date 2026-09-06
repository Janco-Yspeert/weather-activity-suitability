import { describe, expect, it, vi } from "vitest";

import { OpenMeteoClient, ProviderResponseError } from "../src/open-meteo.js";

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 503, json: async () => body } as Response;
}

describe("OpenMeteoClient", () => {
  it("resolves the first accepted city/town from the full caller query", async () => {
    const fetch = vi.fn(async (_url: string) =>
      jsonResponse({
        results: [
          {
            id: 1,
            name: "Cambridge Township",
            latitude: 40,
            longitude: -71,
            timezone: "America/New_York",
            feature_code: "PPLX",
            country_code: "US",
          },
          {
            id: 2,
            name: "Cambridge",
            latitude: 42.3751,
            longitude: -71.1056,
            timezone: "America/New_York",
            feature_code: "PPL",
            country_code: "US",
            country: "United States",
            admin1: "Massachusetts",
          },
        ],
      }),
    );
    const client = new OpenMeteoClient(fetch);

    await expect(client.resolveLocation("Cambridge, Massachusetts")).resolves.toEqual({
      id: "2",
      name: "Cambridge",
      latitude: 42.3751,
      longitude: -71.1056,
      timezone: "America/New_York",
      countryCode: "US",
      country: "United States",
      admin1: "Massachusetts",
    });
    const requestedUrl = new URL(fetch.mock.calls[0]![0] as string);
    expect(requestedUrl.searchParams.get("name")).toBe("Cambridge, Massachusetts");
  });

  it("rejects malformed geocoding data at the provider boundary", async () => {
    const client = new OpenMeteoClient(async () =>
      jsonResponse({ results: [{ id: 1, name: "Cape Town", latitude: "nope" }] }),
    );

    await expect(client.resolveLocation("Cape Town")).rejects.toBeInstanceOf(ProviderResponseError);
  });

  it("reports no supported location when only excluded feature codes are returned", async () => {
    const client = new OpenMeteoClient(async () =>
      jsonResponse({
        results: [
          {
            id: 1,
            name: "Somewhere",
            latitude: 1,
            longitude: 2,
            timezone: "UTC",
            feature_code: "PPLX",
          },
        ],
      }),
    );

    await expect(client.resolveLocation("Somewhere")).rejects.toThrow("No supported city or town found");
  });

  it("maps validated forecast timestamps and requests local hourly coverage", async () => {
    const fetch = vi.fn(async (_url: string) =>
      jsonResponse({
        timezone: "Africa/Johannesburg",
        hourly: {
          time: ["2026-09-07T00:00", "2026-09-07T01:00"],
          temperature_2m: [12.3, null],
        },
      }),
    );
    const client = new OpenMeteoClient(fetch);

    await expect(
      client.fetchForecast({
        id: "3369157",
        name: "Cape Town",
        latitude: -33.9258,
        longitude: 18.4232,
        timezone: "Africa/Johannesburg",
      }),
    ).resolves.toEqual({ localTimestamps: ["2026-09-07T00:00", "2026-09-07T01:00"] });

    const requestedUrl = new URL(fetch.mock.calls[0]![0] as string);
    expect(requestedUrl.searchParams.get("timezone")).toBe("Africa/Johannesburg");
    expect(requestedUrl.searchParams.get("forecast_hours")).toBe("195");
    expect(requestedUrl.searchParams.get("hourly")).toBe("temperature_2m");
  });

  it("rejects malformed or misaligned forecast observations", async () => {
    const client = new OpenMeteoClient(async () =>
      jsonResponse({
        timezone: "UTC",
        hourly: { time: ["2026-09-07T00:00"], temperature_2m: [] },
      }),
    );

    await expect(
      client.fetchForecast({ id: "1", name: "London", latitude: 51.5, longitude: -0.1, timezone: "UTC" }),
    ).rejects.toBeInstanceOf(ProviderResponseError);
  });
});
