import { DatabaseSync } from "node:sqlite";
import { z } from "zod";

import type { ResolvedLocation, SourceForecast } from "./open-meteo.js";

export type SourceKind = "WEATHER" | "MARINE";

export interface SourceSnapshot {
  locationId: string;
  source: SourceKind;
  fetchedAt: Date;
  requestedFromDate: string;
  requestedThroughDate: string;
  forecast: SourceForecast;
}

export interface ForecastStore {
  findLocationByAlias(normalizedQuery: string): ResolvedLocation | null;
  saveLocationAlias(normalizedQuery: string, location: ResolvedLocation): void;
  latestSnapshot(locationId: string, source: SourceKind): SourceSnapshot | null;
  appendSnapshot(snapshot: SourceSnapshot): void;
}

const localTimestamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
const forecastSchema = z
  .object({
    localTimestamps: z.array(localTimestamp),
    observations: z.record(z.string(), z.array(z.number().nullable())),
    solarDays: z
      .array(
        z.object({
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          sunrise: localTimestamp.nullable(),
          sunset: localTimestamp.nullable(),
        }),
      )
      .optional(),
  })
  .superRefine((forecast, context) => {
    for (const [name, values] of Object.entries(forecast.observations)) {
      if (values.length !== forecast.localTimestamps.length) {
        context.addIssue({
          code: "custom",
          path: ["observations", name],
          message: "Stored observations and timestamps must be aligned",
        });
      }
    }
  });

const STORAGE_SCHEMA_VERSION = 1;
const SOURCE_OBSERVATIONS: Record<SourceKind, ReadonlySet<string>> = {
  WEATHER: new Set([
    "airTemperature",
    "apparentTemperature",
    "precipitation",
    "rain",
    "snowfall",
    "snowDepth",
    "windSpeed",
    "windGust",
    "visibility",
    "weatherCode",
    "cloudCover",
  ]),
  MARINE: new Set(["waveHeight", "swellPeriod", "wavePeriod"]),
};

function validateForecast(source: SourceKind, value: unknown): SourceForecast {
  const parsed = forecastSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("Invalid stored forecast payload", {
      cause: parsed.error,
    });
  }
  const allowed = SOURCE_OBSERVATIONS[source];
  const names = Object.keys(parsed.data.observations);
  if (
    names.some((name) => !allowed.has(name)) ||
    [...allowed].some((name) => !names.includes(name))
  ) {
    throw new Error(
      `Invalid ${source.toLowerCase()} observations in stored forecast payload`,
    );
  }
  if (source === "MARINE" && parsed.data.solarDays !== undefined) {
    throw new Error(
      "Marine stored forecast payload must not contain solar days",
    );
  }
  return {
    localTimestamps: parsed.data.localTimestamps,
    observations: parsed.data.observations,
    ...(parsed.data.solarDays === undefined
      ? {}
      : { solarDays: parsed.data.solarDays }),
  };
}

export class MemoryForecastStore implements ForecastStore {
  private readonly locations = new Map<string, ResolvedLocation>();
  private readonly aliases = new Map<string, string>();
  private readonly snapshots: SourceSnapshot[] = [];

  findLocationByAlias(normalizedQuery: string): ResolvedLocation | null {
    const id = this.aliases.get(normalizedQuery);
    return id === undefined ? null : (this.locations.get(id) ?? null);
  }

  saveLocationAlias(normalizedQuery: string, location: ResolvedLocation): void {
    this.locations.set(location.id, location);
    this.aliases.set(normalizedQuery, location.id);
  }

  latestSnapshot(
    locationId: string,
    source: SourceKind,
  ): SourceSnapshot | null {
    return (
      this.snapshots
        .filter(
          (snapshot) =>
            snapshot.locationId === locationId && snapshot.source === source,
        )
        .sort(
          (left, right) => right.fetchedAt.getTime() - left.fetchedAt.getTime(),
        )[0] ?? null
    );
  }

  appendSnapshot(snapshot: SourceSnapshot): void {
    this.snapshots.push(snapshot);
  }
}

interface LocationRow {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
  country_code: string | null;
  country: string | null;
  admin1: string | null;
}

interface SnapshotRow {
  location_id: string;
  source: SourceKind;
  fetched_at: string;
  requested_from_date: string;
  requested_through_date: string;
  schema_version: number;
  payload: string;
}

export class SqliteForecastStore implements ForecastStore {
  private readonly database: DatabaseSync;

  constructor(path: string) {
    this.database = new DatabaseSync(path);
    this.database.exec("PRAGMA foreign_keys = ON");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS location (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        timezone TEXT NOT NULL,
        country_code TEXT,
        country TEXT,
        admin1 TEXT
      ) STRICT;
      CREATE TABLE IF NOT EXISTS location_alias (
        normalized_query TEXT PRIMARY KEY,
        location_id TEXT NOT NULL REFERENCES location(id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS source_snapshot (
        id INTEGER PRIMARY KEY,
        location_id TEXT NOT NULL REFERENCES location(id),
        source TEXT NOT NULL CHECK (source IN ('WEATHER', 'MARINE')),
        fetched_at TEXT NOT NULL,
        requested_from_date TEXT NOT NULL,
        requested_through_date TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        payload TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS source_snapshot_latest
        ON source_snapshot(location_id, source, fetched_at DESC, id DESC);
    `);
  }

  findLocationByAlias(normalizedQuery: string): ResolvedLocation | null {
    const row = this.database
      .prepare(
        `SELECT l.* FROM location_alias a JOIN location l ON l.id = a.location_id
                WHERE a.normalized_query = ?`,
      )
      .get(normalizedQuery) as unknown as LocationRow | undefined;
    if (row === undefined) return null;
    return {
      id: row.id,
      name: row.name,
      latitude: row.latitude,
      longitude: row.longitude,
      timezone: row.timezone,
      ...(row.country_code === null ? {} : { countryCode: row.country_code }),
      ...(row.country === null ? {} : { country: row.country }),
      ...(row.admin1 === null ? {} : { admin1: row.admin1 }),
    };
  }

  saveLocationAlias(normalizedQuery: string, location: ResolvedLocation): void {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database
        .prepare(
          `
        INSERT INTO location (id, name, latitude, longitude, timezone, country_code, country, admin1)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, latitude=excluded.latitude,
          longitude=excluded.longitude, timezone=excluded.timezone,
          country_code=excluded.country_code, country=excluded.country, admin1=excluded.admin1
      `,
        )
        .run(
          location.id,
          location.name,
          location.latitude,
          location.longitude,
          location.timezone,
          location.countryCode ?? null,
          location.country ?? null,
          location.admin1 ?? null,
        );
      this.database
        .prepare(
          `
        INSERT INTO location_alias (normalized_query, location_id) VALUES (?, ?)
        ON CONFLICT(normalized_query) DO UPDATE SET location_id=excluded.location_id
      `,
        )
        .run(normalizedQuery, location.id);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  latestSnapshot(
    locationId: string,
    source: SourceKind,
  ): SourceSnapshot | null {
    const row = this.database
      .prepare(
        `
      SELECT location_id, source, fetched_at, requested_from_date,
             requested_through_date, schema_version, payload
      FROM source_snapshot WHERE location_id = ? AND source = ?
      ORDER BY fetched_at DESC, id DESC LIMIT 1
    `,
      )
      .get(locationId, source) as unknown as SnapshotRow | undefined;
    if (row === undefined) return null;
    if (row.schema_version !== STORAGE_SCHEMA_VERSION) {
      throw new Error(
        `Unsupported forecast storage schema version ${row.schema_version}`,
      );
    }
    return {
      locationId: row.location_id,
      source: row.source,
      fetchedAt: new Date(row.fetched_at),
      requestedFromDate: row.requested_from_date,
      requestedThroughDate: row.requested_through_date,
      forecast: validateForecast(
        row.source,
        JSON.parse(row.payload) as unknown,
      ),
    };
  }

  appendSnapshot(snapshot: SourceSnapshot): void {
    const forecast = validateForecast(snapshot.source, snapshot.forecast);
    this.database
      .prepare(
        `
      INSERT INTO source_snapshot (
        location_id, source, fetched_at, requested_from_date,
        requested_through_date, schema_version, payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        snapshot.locationId,
        snapshot.source,
        snapshot.fetchedAt.toISOString(),
        snapshot.requestedFromDate,
        snapshot.requestedThroughDate,
        STORAGE_SCHEMA_VERSION,
        JSON.stringify(forecast),
      );
  }

  close(): void {
    this.database.close();
  }
}
