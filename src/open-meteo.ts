import { z } from "zod";

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

export type WeatherObservation =
  | "airTemperature"
  | "apparentTemperature"
  | "precipitation"
  | "rain"
  | "snowfall"
  | "snowDepth"
  | "windSpeed"
  | "windGust"
  | "visibility"
  | "weatherCode"
  | "cloudCover";
export type MarineObservation = "waveHeight" | "swellPeriod" | "wavePeriod";

export interface SolarDay {
  date: string;
  sunrise: string | null;
  sunset: string | null;
}

export interface SourceForecast<Observation extends string = string> {
  localTimestamps: readonly string[];
  observations: Readonly<Record<Observation, readonly (number | null)[]>>;
  solarDays?: readonly SolarDay[];
}

type Fetcher = (url: string) => Promise<Response>;

const POPULATED_PLACE_CODES = new Set([
  "PPL",
  "PPLA",
  "PPLA2",
  "PPLA3",
  "PPLA4",
  "PPLA5",
  "PPLC",
  "PPLG",
]);
const WEATHER_FIELDS: Record<WeatherObservation, string> = {
  airTemperature: "temperature_2m",
  apparentTemperature: "apparent_temperature",
  precipitation: "precipitation",
  rain: "rain",
  snowfall: "snowfall",
  snowDepth: "snow_depth",
  windSpeed: "wind_speed_10m",
  windGust: "wind_gusts_10m",
  visibility: "visibility",
  weatherCode: "weather_code",
  cloudCover: "cloud_cover",
};
const MARINE_FIELDS: Record<MarineObservation, string> = {
  waveHeight: "wave_height",
  swellPeriod: "swell_wave_period",
  wavePeriod: "wave_period",
};

const timezoneSchema = z
  .string()
  .min(1)
  .refine(isValidTimezone, "Invalid IANA timezone");
const geocodingResultSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  timezone: timezoneSchema,
  feature_code: z.string().min(1),
  country_code: z.string().optional(),
  country: z.string().optional(),
  admin1: z.string().optional(),
  admin2: z.string().optional(),
  admin3: z.string().optional(),
  admin4: z.string().optional(),
});
const geocodingResponseSchema = z.object({
  results: z.array(geocodingResultSchema).optional(),
});

type GeocodingResult = z.infer<typeof geocodingResultSchema>;

export class ProviderError extends Error {}

export class ProviderRequestError extends ProviderError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProviderRequestError";
  }
}

export class ProviderResponseError extends ProviderError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
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
    url.search = new URLSearchParams({
      name: query,
      count: "10",
      language: "en",
      format: "json",
    }).toString();
    const body = await this.requestJson(url);
    const response = parseProviderResponse(
      geocodingResponseSchema,
      body,
      "geocoding response",
    );
    const match = response.results?.find(
      (result) =>
        POPULATED_PLACE_CODES.has(result.feature_code) &&
        qualifiersMatch(query, result),
    );

    if (!match) throw new LocationNotFoundError(query);
    return mapLocation(match);
  }

  async fetchWeather<Observation extends WeatherObservation>(
    location: ResolvedLocation,
    observations: readonly Observation[],
  ): Promise<SourceForecast<Observation>> {
    return this.fetchSource(
      "https://api.open-meteo.com/v1/forecast",
      location,
      observations,
      WEATHER_FIELDS,
      true,
    );
  }

  async fetchMarine<Observation extends MarineObservation>(
    location: ResolvedLocation,
    observations: readonly Observation[],
  ): Promise<SourceForecast<Observation>> {
    return this.fetchSource(
      "https://marine-api.open-meteo.com/v1/marine",
      location,
      observations,
      MARINE_FIELDS,
      false,
    );
  }

  private async fetchSource<Observation extends string>(
    endpoint: string,
    location: ResolvedLocation,
    observations: readonly Observation[],
    providerFields: Readonly<Record<Observation, string>>,
    includeSolar: boolean,
  ): Promise<SourceForecast<Observation>> {
    if (observations.length === 0)
      throw new Error("At least one observation must be requested");
    const requestedFields = observations.map(
      (observation) => providerFields[observation],
    );
    const url = new URL(endpoint);
    url.search = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      timezone: location.timezone,
      hourly: requestedFields.join(","),
      forecast_hours: "195",
      ...(includeSolar ? { daily: "sunrise,sunset", forecast_days: "8" } : {}),
    }).toString();
    const body = await this.requestJson(url);
    return parseSourceResponse(
      body,
      location.timezone,
      observations,
      providerFields,
      includeSolar,
    );
  }

  private async requestJson(url: URL): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetcher(url.toString());
    } catch (cause) {
      throw new ProviderRequestError("Open-Meteo request failed", { cause });
    }

    if (!response.ok) {
      throw new ProviderRequestError(
        `Open-Meteo request failed with HTTP ${response.status}`,
      );
    }

    try {
      return (await response.json()) as unknown;
    } catch (cause) {
      throw new ProviderResponseError("Open-Meteo returned invalid JSON", {
        cause,
      });
    }
  }
}

function mapLocation(result: GeocodingResult): ResolvedLocation {
  return {
    id: String(result.id),
    name: result.name,
    latitude: result.latitude,
    longitude: result.longitude,
    timezone: result.timezone,
    ...(result.country_code === undefined
      ? {}
      : { countryCode: result.country_code }),
    ...(result.country === undefined ? {} : { country: result.country }),
    ...(result.admin1 === undefined ? {} : { admin1: result.admin1 }),
  };
}

function qualifiersMatch(query: string, result: GeocodingResult): boolean {
  const qualifiers = query
    .split(",")
    .slice(1)
    .map(normalizeGeography)
    .filter(Boolean);
  if (qualifiers.length === 0) return true;

  // Open-Meteo owns base-name search relevance.
  // Caller-supplied geographic qualifiers are independently enforced here.
  const providerGeography = [
    result.country_code,
    result.country,
    result.admin1,
    result.admin2,
    result.admin3,
    result.admin4,
  ]
    .filter((value): value is string => value !== undefined)
    .map(normalizeGeography);
  return qualifiers.every((qualifier) => providerGeography.includes(qualifier));
}

function normalizeGeography(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .toLocaleLowerCase("en");
}

function parseProviderResponse<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
  label: string,
): z.output<Schema> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ProviderResponseError(`Malformed Open-Meteo ${label}`, {
      cause: result.error,
    });
  }
  return result.data;
}

function parseSourceResponse<Observation extends string>(
  value: unknown,
  expectedTimezone: string,
  requestedObservations: readonly Observation[],
  providerFields: Readonly<Record<Observation, string>>,
  includeSolar: boolean,
): SourceForecast<Observation> {
  const requestedFields = requestedObservations.map(
    (observation) => providerFields[observation],
  );
  const observationArraySchema = z.array(z.number().finite().nullable());
  const isValidTimestamp = createLocalTimestampValidator(expectedTimezone);
  const providerObservationSchemas = Object.fromEntries(
    requestedFields.map((field) => [field, observationArraySchema]),
  ) as Record<string, typeof observationArraySchema>;
  const hourlySchema = z
    .object({
      time: z.array(
        z
          .string()
          .refine(isValidTimestamp, "Invalid destination-local timestamp"),
      ),
      ...providerObservationSchemas,
    })
    .superRefine((hourly, context) => {
      const fields = hourly as Record<string, unknown> & { time: string[] };
      for (const field of requestedFields) {
        const values = fields[field];
        if (Array.isArray(values) && values.length !== hourly.time.length) {
          context.addIssue({
            code: "custom",
            path: [field],
            message: "Observation and timestamp arrays must be aligned",
          });
        }
      }
    });
  const dailySchema = z
    .object({
      time: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
      sunrise: z.array(z.string().refine(isValidTimestamp).nullable()),
      sunset: z.array(z.string().refine(isValidTimestamp).nullable()),
    })
    .superRefine((daily, context) => {
      for (const field of ["sunrise", "sunset"] as const) {
        if (daily[field].length !== daily.time.length) {
          context.addIssue({
            code: "custom",
            path: [field],
            message: "Solar and date arrays must be aligned",
          });
        }
      }
      daily.time.forEach((date, index) => {
        for (const field of ["sunrise", "sunset"] as const) {
          const timestamp = daily[field][index];
          if (
            timestamp !== null &&
            timestamp !== undefined &&
            !timestamp.startsWith(`${date}T`)
          ) {
            context.addIssue({
              code: "custom",
              path: [field, index],
              message: "Solar timestamp must match its local date",
            });
          }
        }
      });
    });
  const sourceResponseSchema = z.object({
    timezone: z.literal(expectedTimezone),
    hourly: hourlySchema,
    ...(includeSolar ? { daily: dailySchema } : {}),
  });
  const response = parseProviderResponse(
    sourceResponseSchema,
    value,
    "forecast response",
  );
  const hourly = response.hourly as Record<string, unknown> & {
    time: string[];
  };
  const observations = {} as Record<Observation, readonly (number | null)[]>;

  for (const observation of requestedObservations) {
    observations[observation] = hourly[providerFields[observation]] as (
      | number
      | null
    )[];
  }

  if (!includeSolar) return { localTimestamps: hourly.time, observations };

  const daily = response.daily as {
    time: string[];
    sunrise: (string | null)[];
    sunset: (string | null)[];
  };
  return {
    localTimestamps: hourly.time,
    observations,
    solarDays: daily.time.map((date, index) => ({
      date,
      sunrise: daily.sunrise[index] ?? null,
      sunset: daily.sunset[index] ?? null,
    })),
  };
}

function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function createLocalTimestampValidator(
  timeZone: string,
): (value: string) => boolean {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  return (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
    if (!match) return false;
    const [, yearText, monthText, dayText, hourText, minuteText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const localAsUtc = Date.UTC(year, month - 1, day, hour, minute);
    const normalized = new Date(localAsUtc);
    if (
      normalized.getUTCFullYear() !== year ||
      normalized.getUTCMonth() !== month - 1 ||
      normalized.getUTCDate() !== day ||
      normalized.getUTCHours() !== hour ||
      normalized.getUTCMinutes() !== minute
    ) {
      return false;
    }

    let candidate = localAsUtc;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const parts = Object.fromEntries(
        formatter
          .formatToParts(new Date(candidate))
          .map(({ type, value: partValue }) => [type, partValue]),
      );
      const representedLocal = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour),
        Number(parts.minute),
      );
      const correction = localAsUtc - representedLocal;
      if (correction === 0) return true;
      candidate += correction;
    }
    return false;
  };
}
