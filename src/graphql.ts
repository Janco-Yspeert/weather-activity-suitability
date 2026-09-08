import { buildSchema, type GraphQLSchema } from "graphql";

import type { ForecastService } from "./forecast-service.js";

const typeDefinitions = /* GraphQL */ `
  enum ActivityRating {
    UNKNOWN
    UNSUITABLE
    POOR
    FAIR
    GOOD
    EXCELLENT
  }

  enum SourceState {
    AVAILABLE
    PARTIAL
    NO_DATA
    UNAVAILABLE
  }

  enum DailyAdvisoryCode {
    EXTREME_WIND
    BLIZZARD_LIKE_CONDITIONS
    HEAVY_FREEZING_RAIN
    EXTREME_HEAT
    EXTREME_COLD
    HEAVY_HAIL_THUNDERSTORM
    SKIING_NO_SNOW
    LARGE_SURF
    NO_SURF
  }

  enum ForecastAdvisoryCode {
    SURFING_NOT_APPLICABLE
    SKIING_NO_SNOW_FORECAST
  }

  type DailyAdvisory {
    date: String!
    codes: [DailyAdvisoryCode!]!
  }

  type SourceAvailability {
    state: SourceState!
    coveredDates: [String!]!
    fetchedAt: String
    stale: Boolean!
  }

  type ForecastMetadata {
    weather: SourceAvailability!
    marine: SourceAvailability!
  }

  type ResolvedLocation {
    id: ID!
    name: String!
    latitude: Float!
    longitude: Float!
    timezone: String!
    countryCode: String
    country: String
    admin1: String
  }

  type ForecastAssessment {
    metadata: ForecastMetadata!
    location: ResolvedLocation!
    dates: [String!]!
    skiing: [ActivityRating!]!
    surfing: [ActivityRating!]!
    outdoorSightseeing: [ActivityRating!]!
    indoorSightseeing: [ActivityRating!]!
    dailyAdvisories: [DailyAdvisory!]!
    forecastAdvisories: [ForecastAdvisoryCode!]!
  }

  type Query {
    forecast(location: String!): ForecastAssessment!
  }
`;

export function createSchema(service: ForecastService): GraphQLSchema {
  const schema = buildSchema(typeDefinitions);
  const forecastField = schema.getQueryType()?.getFields().forecast;
  if (!forecastField) throw new Error("Forecast query is missing from the GraphQL schema");
  forecastField.resolve = (_source, args: { location: string }) => service.assess(args.location);
  return schema;
}
