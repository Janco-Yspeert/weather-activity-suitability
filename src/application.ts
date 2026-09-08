import type { GraphQLSchema } from "graphql";

import { ForecastService, type ForecastProvider } from "./forecast-service.js";
import { createSchema } from "./graphql.js";
import { OpenMeteoClient } from "./open-meteo.js";
import { SqliteForecastStore } from "./storage.js";

export interface ApplicationOptions {
  databasePath: string;
  provider?: ForecastProvider;
  clock?: () => Date;
}

export interface Application {
  service: ForecastService;
  schema: GraphQLSchema;
  close(): void;
}

export function createApplication(options: ApplicationOptions): Application {
  const store = new SqliteForecastStore(options.databasePath);
  const service = new ForecastService(
    options.provider ?? new OpenMeteoClient(),
    options.clock ?? (() => new Date()),
    store,
  );
  return {
    service,
    schema: createSchema(service),
    close: () => store.close(),
  };
}
