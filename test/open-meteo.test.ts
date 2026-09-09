import { describe, expect, it, vi } from "vitest";

import {
  LocationNotFoundError,
  OpenMeteoClient,
  ProviderRequestError,
  ProviderResponseError,
} from "../src/open-meteo.js";

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 503, json: async () => body } as Response;
}

describe("OpenMeteoClient", () => {
  it("reports only complete intended request days across the rolling and calendar inputs", () => {
    const client = new OpenMeteoClient();
    const requiredDates = [
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
    ];

    expect(
      client.getRequestedThroughDate(
        capeTown(),
        "WEATHER",
        new Date("2026-09-06T10:00:00.000Z"),
        requiredDates,
      ),
    ).toBe("2026-09-13");
    expect(
      client.getRequestedThroughDate(
        capeTown(),
        "WEATHER",
        new Date("2026-09-06T20:30:00.000Z"),
        requiredDates,
      ),
    ).toBe("2026-09-14");
    expect(
      client.getRequestedThroughDate(
        capeTown(),
        "MARINE",
        new Date("2026-09-06T20:30:00.000Z"),
        requiredDates,
      ),
    ).toBe("2026-09-14");
  });

  it.each(["TimeoutError", "AbortError"])(
    "retries %s fetch failures with per-attempt timeouts",
    async (errorName) => {
      const fetch = vi
        .fn()
        .mockRejectedValueOnce(
          new DOMException("request interrupted", errorName),
        )
        .mockResolvedValueOnce(jsonResponse({ results: [] }));
      const sleep = vi.fn(async () => undefined);
      const timeoutSignal = vi.fn(() => new AbortController().signal);
      const client = new OpenMeteoClient(fetch, { sleep, timeoutSignal });

      await expect(client.resolveLocation("Nowhere")).rejects.toThrow(
        "No supported city or town found",
      );
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(fetch.mock.calls[0]![1]).toEqual({
        signal: timeoutSignal.mock.results[0]!.value,
      });
      expect(timeoutSignal).toHaveBeenCalledTimes(2);
      expect(timeoutSignal).toHaveBeenCalledWith(4_000);
      expect(sleep).toHaveBeenCalledWith(250);
    },
  );

  it.each([
    new RangeError("request adapter range defect"),
    new TypeError("request adapter type defect"),
  ])(
    "does not retry or relabel programming errors from request execution",
    async (programmingError) => {
      const fetch = vi.fn(async () => {
        throw programmingError;
      });
      const sleep = vi.fn(async () => undefined);
      const client = new OpenMeteoClient(fetch, { sleep });

      await expect(client.resolveLocation("Cape Town")).rejects.toBe(
        programmingError,
      );
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    },
  );

  it.each([408, 429, 503, 504, 520, 599])(
    "retries HTTP %i but stops after three total attempts",
    async (status) => {
      const fetch = vi.fn(async () => ({
        ...jsonResponse({}, false),
        status,
      }));
      const sleep = vi.fn(async () => undefined);
      const client = new OpenMeteoClient(fetch, { sleep });

      await expect(client.resolveLocation("Cape Town")).rejects.toBeInstanceOf(
        ProviderRequestError,
      );
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(sleep.mock.calls).toEqual([[250], [750]]);
    },
  );

  it("recovers when a retryable HTTP failure is followed by success", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, false))
      .mockResolvedValueOnce(jsonResponse({ results: [] }));
    const sleep = vi.fn(async () => undefined);

    await expect(
      new OpenMeteoClient(fetch, { sleep }).resolveLocation("Nowhere"),
    ).rejects.toBeInstanceOf(LocationNotFoundError);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(250);
  });

  it("does not retry non-transient HTTP or response failures", async () => {
    const badRequest = vi.fn(async () => ({
      ...jsonResponse({}, false),
      status: 400,
    }));
    await expect(
      new OpenMeteoClient(badRequest).resolveLocation("Cape Town"),
    ).rejects.toBeInstanceOf(ProviderRequestError);
    expect(badRequest).toHaveBeenCalledTimes(1);

    const invalidJson = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => {
            throw new Error("bad JSON");
          },
        }) as unknown as Response,
    );
    await expect(
      new OpenMeteoClient(invalidJson).resolveLocation("Cape Town"),
    ).rejects.toBeInstanceOf(ProviderResponseError);
    expect(invalidJson).toHaveBeenCalledTimes(1);
  });

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
            feature_code: "PPL",
            country_code: "US",
            country: "United States",
            admin1: "New Jersey",
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

    await expect(
      client.resolveLocation("Cambridge, Massachusetts"),
    ).resolves.toEqual({
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
    expect(requestedUrl.searchParams.get("name")).toBe(
      "Cambridge, Massachusetts",
    );
  });

  it("rejects accepted provider results that contradict an authoritative qualifier", async () => {
    const client = new OpenMeteoClient(async () =>
      jsonResponse({
        results: [
          {
            id: 4931972,
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

    await expect(
      client.resolveLocation("Cambridge, Cambridgeshire"),
    ).rejects.toThrow("No supported city or town found");
  });

  it("rejects malformed geocoding data at the provider boundary", async () => {
    const client = new OpenMeteoClient(async () =>
      jsonResponse({
        results: [{ id: 1, name: "Cape Town", latitude: "nope" }],
      }),
    );

    await expect(client.resolveLocation("Cape Town")).rejects.toBeInstanceOf(
      ProviderResponseError,
    );
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

    await expect(client.resolveLocation("Somewhere")).rejects.toThrow(
      "No supported city or town found",
    );
  });

  it("retries evidenced network failures and wraps exhaustion", async () => {
    const transportCause = Object.assign(new Error("connection reset"), {
      code: "ECONNRESET",
    });
    const fetch = vi.fn(async () => {
      throw new TypeError("fetch failed", {
        cause: transportCause,
      });
    });
    const sleep = vi.fn(async () => undefined);
    const client = new OpenMeteoClient(fetch, { sleep });

    await expect(
      client.fetchWeather(capeTown(), ["airTemperature"]),
    ).rejects.toBeInstanceOf(ProviderRequestError);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[250], [750]]);
  });

  it("translates application-selected weather observations and maps validated data", async () => {
    const fetch = vi.fn(async (_url: string) =>
      jsonResponse({
        timezone: "Africa/Johannesburg",
        hourly: {
          time: ["2026-09-07T00:00", "2026-09-07T01:00"],
          temperature_2m: [12.3, null],
        },
        daily: {
          time: ["2026-09-07"],
          sunrise: ["2026-09-07T06:35"],
          sunset: ["2026-09-07T18:22"],
        },
      }),
    );
    const client = new OpenMeteoClient(fetch);

    await expect(
      client.fetchWeather(
        {
          id: "3369157",
          name: "Cape Town",
          latitude: -33.9258,
          longitude: 18.4232,
          timezone: "Africa/Johannesburg",
        },
        ["airTemperature"],
      ),
    ).resolves.toEqual({
      localTimestamps: ["2026-09-07T00:00", "2026-09-07T01:00"],
      observations: { airTemperature: [12.3, null] },
      solarDays: [
        {
          date: "2026-09-07",
          sunrise: "2026-09-07T06:35",
          sunset: "2026-09-07T18:22",
        },
      ],
    });

    const requestedUrl = new URL(fetch.mock.calls[0]![0] as string);
    expect(requestedUrl.searchParams.get("timezone")).toBe(
      "Africa/Johannesburg",
    );
    expect(requestedUrl.searchParams.get("forecast_hours")).toBe("195");
    expect(requestedUrl.searchParams.get("forecast_days")).toBe("9");
    expect(requestedUrl.searchParams.get("hourly")).toBe("temperature_2m");
    expect(requestedUrl.searchParams.get("daily")).toBe("sunrise,sunset");
  });

  it("translates the complete application-owned v1 observation set", async () => {
    const fetch = vi.fn(async (_url: string) =>
      jsonResponse({
        timezone: "Africa/Johannesburg",
        hourly: {
          time: ["2026-09-07T12:00"],
          temperature_2m: [18],
          apparent_temperature: [18],
          precipitation: [0],
          rain: [0],
          snowfall: [0],
          snow_depth: [0],
          wind_speed_10m: [12],
          wind_gusts_10m: [20],
          visibility: [10000],
          weather_code: [0],
          cloud_cover: [15],
        },
        daily: {
          time: ["2026-09-07"],
          sunrise: ["2026-09-07T06:35"],
          sunset: ["2026-09-07T18:22"],
        },
      }),
    );
    const client = new OpenMeteoClient(fetch);

    const result = await client.fetchWeather(capeTown(), [
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

    expect(result.observations).toMatchObject({
      airTemperature: [18],
      apparentTemperature: [18],
      rain: [0],
      snowDepth: [0],
      windGust: [20],
      weatherCode: [0],
    });
    expect(new URL(fetch.mock.calls[0]![0]).searchParams.get("hourly")).toBe(
      "temperature_2m,apparent_temperature,precipitation,rain,snowfall,snow_depth,wind_speed_10m,wind_gusts_10m,visibility,weather_code,cloud_cover",
    );
  });

  it("translates application-selected marine observations and maps nullable data", async () => {
    const fetch = vi.fn(async (_url: string) =>
      jsonResponse({
        timezone: "Africa/Johannesburg",
        hourly: {
          time: ["2026-09-07T00:00", "2026-09-07T01:00"],
          wave_height: [1.8, null],
        },
      }),
    );
    const client = new OpenMeteoClient(fetch);

    await expect(
      client.fetchMarine(capeTown(), ["waveHeight"]),
    ).resolves.toEqual({
      localTimestamps: ["2026-09-07T00:00", "2026-09-07T01:00"],
      observations: { waveHeight: [1.8, null] },
    });

    const requestedUrl = new URL(fetch.mock.calls[0]![0]);
    expect(requestedUrl.origin).toBe("https://marine-api.open-meteo.com");
    expect(requestedUrl.searchParams.get("timezone")).toBe(
      "Africa/Johannesburg",
    );
    expect(requestedUrl.searchParams.get("hourly")).toBe("wave_height");
  });

  it.each([
    [
      "weather",
      (client: OpenMeteoClient) =>
        client.fetchWeather(capeTown(), ["airTemperature"]),
    ],
    [
      "marine",
      (client: OpenMeteoClient) =>
        client.fetchMarine(capeTown(), ["waveHeight"]),
    ],
  ])(
    "rejects malformed or misaligned %s observations",
    async (_source, request) => {
      const client = new OpenMeteoClient(async () =>
        jsonResponse({
          timezone: "Africa/Johannesburg",
          hourly: {
            time: ["2026-09-07T00:00"],
            temperature_2m: [],
            wave_height: [],
          },
        }),
      );

      await expect(request(client)).rejects.toBeInstanceOf(
        ProviderResponseError,
      );
    },
  );

  it.each([
    [
      "weather",
      "2026-02-30T12:00",
      (client: OpenMeteoClient) =>
        client.fetchWeather(capeTown(), ["airTemperature"]),
    ],
    [
      "marine",
      "2026-09-07T25:00",
      (client: OpenMeteoClient) =>
        client.fetchMarine(capeTown(), ["waveHeight"]),
    ],
  ])(
    "rejects semantically impossible %s local timestamps",
    async (_source, timestamp, request) => {
      const client = new OpenMeteoClient(async () =>
        jsonResponse({
          timezone: "Africa/Johannesburg",
          hourly: {
            time: [timestamp],
            temperature_2m: [12],
            wave_height: [1.5],
          },
        }),
      );

      await expect(request(client)).rejects.toBeInstanceOf(
        ProviderResponseError,
      );
    },
  );

  it("accepts nominal local timestamps without reconstructing DST instants", async () => {
    const client = new OpenMeteoClient(async () =>
      jsonResponse({
        timezone: "America/New_York",
        hourly: {
          time: ["2026-03-08T02:30"],
          wave_height: [1.5],
        },
      }),
    );

    await expect(
      client.fetchMarine({ ...capeTown(), timezone: "America/New_York" }, [
        "waveHeight",
      ]),
    ).resolves.toMatchObject({
      localTimestamps: ["2026-03-08T02:30"],
    });
  });
});

function capeTown() {
  return {
    id: "3369157",
    name: "Cape Town",
    latitude: -33.9258,
    longitude: 18.4232,
    timezone: "Africa/Johannesburg",
  };
}
