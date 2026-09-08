import { ForecastService } from "./forecast-service.js";
import { createSchema } from "./graphql.js";
import { OpenMeteoClient } from "./open-meteo.js";

export const schema = createSchema(new ForecastService(new OpenMeteoClient()));

export { ForecastService } from "./forecast-service.js";
export { createSchema } from "./graphql.js";
export { OpenMeteoClient } from "./open-meteo.js";
export { createApplication } from "./application.js";
export { createGraphqlServer } from "./http-server.js";
export { MemoryForecastStore, SqliteForecastStore } from "./storage.js";
