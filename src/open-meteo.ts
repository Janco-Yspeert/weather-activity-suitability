export interface ResolvedLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
  countryCode?: string;
  country?: string;
  admin1?: string;
}

export interface ForecastData {
  localTimestamps: readonly string[];
}

type Fetcher = (url: string) => Promise<Response>;

const POPULATED_PLACE_CODES = new Set(["PPL", "PPLA", "PPLA2", "PPLA3", "PPLA4", "PPLA5", "PPLC", "PPLG"]);
const LOCAL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export class ProviderResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderResponseError";
  }
}

export class LocationNotFoundError extends Error {
  constructor(query: string) {
    super(`No supported city or town found for "${query}"`);
    this.name = "LocationNotFoundError";
  }
}

export class OpenMeteoClient {
  constructor(private readonly fetcher: Fetcher = (url) => fetch(url)) {}

  async resolveLocation(query: string): Promise<ResolvedLocation> {
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.search = new URLSearchParams({ name: query, count: "10", language: "en", format: "json" }).toString();
    const body = await this.requestJson(url);
    const results = parseGeocodingResponse(body);
    const match = results.find((result) => POPULATED_PLACE_CODES.has(result.featureCode));

    if (!match) throw new LocationNotFoundError(query);

    return {
      id: String(match.id),
      name: match.name,
      latitude: match.latitude,
      longitude: match.longitude,
      timezone: match.timezone,
      ...(match.countryCode === undefined ? {} : { countryCode: match.countryCode }),
      ...(match.country === undefined ? {} : { country: match.country }),
      ...(match.admin1 === undefined ? {} : { admin1: match.admin1 }),
    };
  }

  async fetchForecast(location: ResolvedLocation): Promise<ForecastData> {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.search = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      timezone: location.timezone,
      hourly: "temperature_2m",
      forecast_hours: "195",
    }).toString();
    const body = await this.requestJson(url);
    return parseForecastResponse(body, location.timezone);
  }

  private async requestJson(url: URL): Promise<unknown> {
    const response = await this.fetcher(url.toString());
    if (!response.ok) {
      throw new ProviderResponseError(`Open-Meteo request failed with HTTP ${response.status}`);
    }

    try {
      return (await response.json()) as unknown;
    } catch {
      throw new ProviderResponseError("Open-Meteo returned invalid JSON");
    }
  }
}

interface GeocodingResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
  featureCode: string;
  countryCode?: string;
  country?: string;
  admin1?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) throw malformed(key);
  return value;
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw malformed(key);
  return value;
}

function requiredNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) throw malformed(key);
  return value;
}

function requiredCoordinate(record: Record<string, unknown>, key: "latitude" | "longitude"): number {
  const value = requiredNumber(record, key);
  const limit = key === "latitude" ? 90 : 180;
  if (value < -limit || value > limit) throw malformed(key);
  return value;
}

function requiredTimezone(record: Record<string, unknown>, key: string): string {
  const value = requiredString(record, key);
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
  } catch {
    throw malformed(key);
  }
  return value;
}

function malformed(field: string): ProviderResponseError {
  return new ProviderResponseError(`Malformed Open-Meteo response at ${field}`);
}

function parseGeocodingResponse(value: unknown): GeocodingResult[] {
  if (!isRecord(value)) throw malformed("geocoding response");
  if (value.results === undefined) return [];
  if (!Array.isArray(value.results)) throw malformed("results");

  return value.results.map((item, index) => {
    if (!isRecord(item)) throw malformed(`results[${index}]`);
    const countryCode = optionalString(item, "country_code");
    const country = optionalString(item, "country");
    const admin1 = optionalString(item, "admin1");
    return {
      id: requiredNumber(item, "id"),
      name: requiredString(item, "name"),
      latitude: requiredCoordinate(item, "latitude"),
      longitude: requiredCoordinate(item, "longitude"),
      timezone: requiredTimezone(item, "timezone"),
      featureCode: requiredString(item, "feature_code"),
      ...(countryCode === undefined ? {} : { countryCode }),
      ...(country === undefined ? {} : { country }),
      ...(admin1 === undefined ? {} : { admin1 }),
    };
  });
}

function parseForecastResponse(value: unknown, expectedTimezone: string): ForecastData {
  if (!isRecord(value)) throw malformed("forecast response");
  if (requiredTimezone(value, "timezone") !== expectedTimezone) throw malformed("timezone");
  if (!isRecord(value.hourly)) throw malformed("hourly");

  const times = value.hourly.time;
  const temperatures = value.hourly.temperature_2m;
  if (!Array.isArray(times) || !times.every((time) => typeof time === "string" && LOCAL_TIMESTAMP.test(time))) {
    throw malformed("hourly.time");
  }
  if (
    !Array.isArray(temperatures) ||
    !temperatures.every((temperature) => temperature === null || (typeof temperature === "number" && Number.isFinite(temperature))) ||
    temperatures.length !== times.length
  ) {
    throw malformed("hourly.temperature_2m");
  }

  return { localTimestamps: times };
}
