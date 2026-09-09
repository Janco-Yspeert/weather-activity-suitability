import { z } from "zod";

import { localDateSchema, localTimestampSchema } from "./local-date-time.js";

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

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export interface OpenMeteoClientOptions {
  sleep?: (milliseconds: number) => Promise<void>;
  timeoutSignal?: (milliseconds: number) => AbortSignal;
}

const RETRY_DELAYS = [250, 750] as const;
const REQUEST_TIMEOUT_MILLISECONDS = 4_000;
const FORECAST_HOURS = 195;
const WEATHER_FORECAST_DAYS = 9;
const RETRYABLE_TRANSPORT_CODES = new Set([
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

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
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly timeoutSignal: (milliseconds: number) => AbortSignal;

  constructor(
    private readonly fetcher: Fetcher = (url, init) => fetch(url, init),
    options: OpenMeteoClientOptions = {},
  ) {
    this.sleep =
      options.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.timeoutSignal =
      options.timeoutSignal ??
      ((milliseconds) => AbortSignal.timeout(milliseconds));
  }

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

  getRequestedThroughDate(
    location: ResolvedLocation,
    source: "WEATHER" | "MARINE",
    requestedAt: Date,
    requiredDates: readonly string[],
  ): string {
    const requiredThroughDate = requiredDates.at(-1);
    if (requiredThroughDate === undefined) {
      throw new Error("At least one required forecast date is needed");
    }
    const localHour = Number(
      new Intl.DateTimeFormat("en", {
        timeZone: location.timezone,
        hour: "2-digit",
        hourCycle: "h23",
      }).format(requestedAt),
    );
    // The accepted v1 timeline deliberately uses ordinary 24-hour local days.
    // At 21:00, 195 hourly slots exactly cover the remainder of today, the
    // seven required days, and one additional complete day.
    const hoursThroughExtraDay =
      24 - localHour + (requiredDates.length + 1) * 24;
    const hourlyInputsCoverExtraDay = FORECAST_HOURS >= hoursThroughExtraDay;
    const calendarInputsCoverExtraDay =
      source === "MARINE" || WEATHER_FORECAST_DAYS >= requiredDates.length + 2;

    return hourlyInputsCoverExtraDay && calendarInputsCoverExtraDay
      ? addCalendarDays(requiredThroughDate, 1)
      : requiredThroughDate;
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
      forecast_hours: String(FORECAST_HOURS),
      ...(includeSolar
        ? {
            daily: "sunrise,sunset",
            forecast_days: String(WEATHER_FORECAST_DAYS),
          }
        : {}),
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
    let lastFailure: ProviderRequestError | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let response: Response | undefined;
      const signal = this.timeoutSignal(REQUEST_TIMEOUT_MILLISECONDS);
      try {
        response = await this.fetcher(url.toString(), {
          signal,
        });
      } catch (cause) {
        if (!isRetryableTransportFailure(cause)) throw cause;
        lastFailure = new ProviderRequestError("Open-Meteo request failed", {
          cause,
        });
      }
      if (response?.ok) {
        try {
          return (await response.json()) as unknown;
        } catch (cause) {
          if (!isRetryableTransportFailure(cause)) {
            throw new ProviderResponseError("Open-Meteo returned invalid JSON", {
              cause,
            });
          }
          lastFailure = new ProviderRequestError("Open-Meteo request failed", {
            cause,
          });
        }
      } else if (response !== undefined) {
        const failure = new ProviderRequestError(
          `Open-Meteo request failed with HTTP ${response.status}`,
        );
        if (!isRetryableStatus(response.status)) throw failure;
        lastFailure = failure;
      }

      const delay = RETRY_DELAYS[attempt];
      if (delay !== undefined) await this.sleep(delay);
    }
    throw lastFailure ?? new ProviderRequestError("Open-Meteo request failed");
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

function addCalendarDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function isRetryableTransportFailure(error: unknown): boolean {
  if (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  ) {
    return true;
  }

  if (!(error instanceof Error)) return false;

  const code = (error as Error & { code?: unknown }).code;

  if (typeof code === "string" && RETRYABLE_TRANSPORT_CODES.has(code)) {
    return true;
  }

  return error.cause !== undefined && isRetryableTransportFailure(error.cause);
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
  const observationArraySchema = z.array(z.number().nullable());

  const providerObservationSchemas = Object.fromEntries(
    requestedFields.map((field) => [field, observationArraySchema]),
  ) as Record<string, typeof observationArraySchema>;
  const hourlySchema = z
    .object({
      time: z.array(localTimestampSchema),
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
      time: z.array(localDateSchema),
      sunrise: z.array(localTimestampSchema.nullable()),
      sunset: z.array(localTimestampSchema.nullable()),
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
