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

  type ForecastMetadata {
    fetchedAt: String!
    forecastCoveredDates: [String!]!
    hasRequiredCoverage: Boolean!
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
