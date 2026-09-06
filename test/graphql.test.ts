import { graphql } from "graphql";
import { describe, expect, it } from "vitest";

import { ForecastService, type ForecastProvider } from "../src/forecast-service.js";
import { createSchema } from "../src/graphql.js";

describe("forecast GraphQL contract", () => {
  it("exposes the resolved location, target dates, metadata, and aligned ratings", async () => {
    const provider: ForecastProvider = {
      resolveLocation: async () => ({
        id: "2950159",
        name: "Berlin",
        latitude: 52.5244,
        longitude: 13.4105,
        timezone: "Europe/Berlin",
        countryCode: "DE",
        country: "Germany",
        admin1: "Berlin",
      }),
      fetchForecast: async () => ({
        localTimestamps: [
          "2026-09-07T00:00",
          "2026-09-08T00:00",
          "2026-09-09T00:00",
          "2026-09-10T00:00",
          "2026-09-11T00:00",
          "2026-09-12T00:00",
          "2026-09-13T00:00",
        ],
      }),
    };
    const schema = createSchema(new ForecastService(provider, () => new Date("2026-09-06T10:00:00.000Z")));

    const result = await graphql({
      schema,
      source: `
        query Forecast($place: String!) {
          forecast(location: $place) {
            metadata { fetchedAt forecastCoveredDates hasRequiredCoverage }
            location { id name latitude longitude timezone countryCode country admin1 }
            dates
            skiing
            surfing
            outdoorSightseeing
            indoorSightseeing
          }
        }
      `,
      variableValues: { place: "Berlin" },
    });

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      forecast: {
        metadata: {
          fetchedAt: "2026-09-06T10:00:00.000Z",
          forecastCoveredDates: [
            "2026-09-07",
            "2026-09-08",
            "2026-09-09",
            "2026-09-10",
            "2026-09-11",
            "2026-09-12",
            "2026-09-13",
          ],
          hasRequiredCoverage: true,
        },
        location: {
          id: "2950159",
          name: "Berlin",
          latitude: 52.5244,
          longitude: 13.4105,
          timezone: "Europe/Berlin",
          countryCode: "DE",
          country: "Germany",
          admin1: "Berlin",
        },
        dates: [
          "2026-09-07",
          "2026-09-08",
          "2026-09-09",
          "2026-09-10",
          "2026-09-11",
          "2026-09-12",
          "2026-09-13",
        ],
        skiing: Array(7).fill("UNKNOWN"),
        surfing: Array(7).fill("UNKNOWN"),
        outdoorSightseeing: Array(7).fill("UNKNOWN"),
        indoorSightseeing: Array(7).fill("UNKNOWN"),
      },
    });
  });
});
