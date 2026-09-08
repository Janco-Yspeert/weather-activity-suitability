import { createApplication } from "./application.js";
import { createGraphqlServer } from "./http-server.js";

const databasePath = process.env.WEATHER_DATABASE_PATH ?? "weather.sqlite";
const port = parsePort(process.env.PORT);
const host = process.env.HOST ?? "127.0.0.1";
const application = createApplication({ databasePath });
const server = createGraphqlServer(application.schema);

server.listen(port, host, () => {
  console.log(`GraphQL weather service listening at http://${host}:${port}/graphql`);
});

server.on("close", () => application.close());
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => server.close());
}

function parsePort(value: string | undefined): number {
  if (value === undefined) return 4000;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65_535) {
    throw new Error(`Invalid PORT: ${value}`);
  }
  return parsed;
}
