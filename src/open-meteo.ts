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

export type WeatherObservation = "airTemperature";
export type MarineObservation = "waveHeight";

export interface SourceForecast {
  localTimestamps: readonly string[];
  observations: Readonly<Record<string, readonly (number | null)[]>>;
}

type Fetcher = (url: string) => Promise<Response>;

const POPULATED_PLACE_CODES = new Set(["PPL", "PPLA", "PPLA2", "PPLA3", "PPLA4", "PPLA5", "PPLC", "PPLG"]);
const LOCAL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const WEATHER_FIELDS: Record<WeatherObservation, string> = {
  airTemperature: "temperature_2m",
};
const MARINE_FIELDS: Record<MarineObservation, string> = {
  waveHeight: "wave_height",
};

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

  async fetchWeather(
    location: ResolvedLocation,
    observations: readonly WeatherObservation[],
  ): Promise<SourceForecast> {
    return this.fetchSource("https://api.open-meteo.com/v1/forecast", location, observations, WEATHER_FIELDS);
  }

  async fetchMarine(
    location: ResolvedLocation,
    observations: readonly MarineObservation[],
  ): Promise<SourceForecast> {
    return this.fetchSource("https://marine-api.open-meteo.com/v1/marine", location, observations, MARINE_FIELDS);
  }

  private async fetchSource<Observation extends string>(
    endpoint: string,
    location: ResolvedLocation,
    observations: readonly Observation[],
    providerFields: Readonly<Record<Observation, string>>,
  ): Promise<SourceForecast> {
    if (observations.length === 0) throw new Error("At least one observation must be requested");
    const requestedFields = observations.map((observation) => providerFields[observation]);
    const url = new URL(endpoint);
    url.search = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      timezone: location.timezone,
      hourly: requestedFields.join(","),
      forecast_hours: "195",
    }).toString();
    const body = await this.requestJson(url);
    return parseSourceResponse(body, location.timezone, observations, providerFields);
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

function parseSourceResponse<Observation extends string>(
  value: unknown,
  expectedTimezone: string,
  requestedObservations: readonly Observation[],
  providerFields: Readonly<Record<Observation, string>>,
): SourceForecast {
  if (!isRecord(value)) throw malformed("forecast response");
  if (requiredTimezone(value, "timezone") !== expectedTimezone) throw malformed("timezone");
  if (!isRecord(value.hourly)) throw malformed("hourly");

  const times = value.hourly.time;
  if (!Array.isArray(times) || !times.every((time) => typeof time === "string" && LOCAL_TIMESTAMP.test(time))) {
    throw malformed("hourly.time");
  }

  const observations: Record<string, readonly (number | null)[]> = {};
  for (const observation of requestedObservations) {
    const providerField = providerFields[observation];
    const values = value.hourly[providerField];
    if (
      !Array.isArray(values) ||
      !values.every((item) => item === null || (typeof item === "number" && Number.isFinite(item))) ||
      values.length !== times.length
    ) {
      throw malformed(`hourly.${providerField}`);
    }
    observations[observation] = values;
  }

  return { localTimestamps: times, observations };
}
