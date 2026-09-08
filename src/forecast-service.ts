import {
  getTargetDates,
  isFreshSnapshot,
  isStaleFallbackEligible,
  type LocalDate,
} from "./forecast-policy.js";
import {
  scoreActivities,
  type ActivityRating,
  type DailyAdvisory,
  type ForecastAdvisoryCode,
} from "./activity-scoring.js";
import { ProviderError } from "./open-meteo.js";
import {
  MemoryForecastStore,
  type ForecastStore,
  type SourceKind,
  type SourceSnapshot,
} from "./storage.js";
import type {
  MarineObservation,
  ResolvedLocation,
  SourceForecast,
  WeatherObservation,
} from "./open-meteo.js";

const REQUIRED_WEATHER_OBSERVATIONS = [
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
] as const satisfies readonly WeatherObservation[];
const REQUIRED_MARINE_OBSERVATIONS = [
  "waveHeight",
  "swellPeriod",
  "wavePeriod",
] as const satisfies readonly MarineObservation[];

export interface ForecastProvider {
  resolveLocation(query: string): Promise<ResolvedLocation>;
  fetchWeather(
    location: ResolvedLocation,
    observations: readonly WeatherObservation[],
  ): Promise<SourceForecast<WeatherObservation>>;
  fetchMarine(
    location: ResolvedLocation,
    observations: readonly MarineObservation[],
  ): Promise<SourceForecast<MarineObservation>>;
}

export type { ActivityRating } from "./activity-scoring.js";
export type SourceState = "AVAILABLE" | "PARTIAL" | "NO_DATA" | "UNAVAILABLE";

export interface SourceAvailability {
  state: SourceState;
  coveredDates: LocalDate[];
  fetchedAt: string | null;
  stale: boolean;
}

export interface ForecastAssessment {
  metadata: {
    weather: SourceAvailability;
    marine: SourceAvailability;
  };
  location: ResolvedLocation;
  dates: LocalDate[];
  skiing: ActivityRating[];
  surfing: ActivityRating[];
  outdoorSightseeing: ActivityRating[];
  indoorSightseeing: ActivityRating[];
  dailyAdvisories: DailyAdvisory[];
  forecastAdvisories: ForecastAdvisoryCode[];
}

interface SelectedSource<Observation extends string> {
  forecast: SourceForecast<Observation> | null;
  fetchedAt: Date | null;
  stale: boolean;
}

interface SelectedSources {
  weather: SelectedSource<WeatherObservation>;
  marine: SelectedSource<MarineObservation>;
}

export class ForecastService {
  private readonly inFlightRefreshes = new Map<string, Promise<SourceSnapshot>>();

  constructor(
    private readonly provider: ForecastProvider,
    private readonly clock: () => Date = () => new Date(),
    private readonly store: ForecastStore = new MemoryForecastStore(),
  ) {}

  async assess(query: string): Promise<ForecastAssessment> {
    const normalizedQuery = normalizeLocationQuery(query);
    if (normalizedQuery.length === 0)
      throw new Error("Location must not be empty");

    const location = await this.resolveLocation(normalizedQuery, query.trim());
    const now = this.clock();
    const dates = getTargetDates(now, location.timezone);
    const sources = await this.selectSources(location, dates, now);
    const activities = scoreActivities(
      sources.weather.forecast,
      sources.marine.forecast,
      dates,
    );

    return {
      metadata: {
        weather: describeAvailability(sources.weather, dates),
        marine: describeAvailability(sources.marine, dates),
      },
      location,
      dates,
      ...activities,
    };
  }

  private async resolveLocation(
    normalizedQuery: string,
    providerQuery: string,
  ): Promise<ResolvedLocation> {
    const cached = this.store.findLocationByAlias(normalizedQuery);
    if (cached !== null) return cached;
    const location = await this.provider.resolveLocation(providerQuery);
    this.store.saveLocationAlias(normalizedQuery, location);
    return location;
  }

  private async selectSources(
    location: ResolvedLocation,
    dates: readonly LocalDate[],
    now: Date,
  ): Promise<SelectedSources> {
    const [weather, marine] = await Promise.all([
      this.selectSource(location, "WEATHER", dates, now),
      this.selectSource(location, "MARINE", dates, now),
    ]);
    return { weather, marine };
  }

  private async selectSource<
    Observation extends WeatherObservation | MarineObservation,
  >(
    location: ResolvedLocation,
    source: SourceKind,
    dates: readonly LocalDate[],
    now: Date,
  ): Promise<SelectedSource<Observation>> {
    const latest = this.store.latestSnapshot(location.id, source);
    if (latest !== null && isFreshSnapshot(latest, location.id, dates, now)) {
      return selectedSnapshot(latest, false);
    }

    try {
      const refreshed = await this.refreshSource(location, source, dates);
      return selectedSnapshot(refreshed, false);
    } catch (error) {
      if (!(error instanceof ProviderError)) throw error;
    }

    const fallback = this.store.latestSnapshot(location.id, source);
    if (
      fallback !== null &&
      isStaleFallbackEligible(fallback, location.id, now)
    ) {
      return selectedSnapshot(fallback, true);
    }
    return { forecast: null, fetchedAt: null, stale: false };
  }

  private async refreshSource(
    location: ResolvedLocation,
    source: SourceKind,
    dates: readonly LocalDate[],
  ): Promise<SourceSnapshot> {
    const key = `${location.id}:${source}:${dates.at(-1) ?? ""}`;
    const existing = this.inFlightRefreshes.get(key);
    if (existing) return await existing;

    const refresh = this.fetchAndPersist(location, source, dates);
    this.inFlightRefreshes.set(key, refresh);
    try {
      return await refresh;
    } finally {
      if (this.inFlightRefreshes.get(key) === refresh) {
        this.inFlightRefreshes.delete(key);
      }
    }
  }

  private async fetchAndPersist(
    location: ResolvedLocation,
    source: SourceKind,
    dates: readonly LocalDate[],
  ): Promise<SourceSnapshot> {
    const forecast =
      source === "WEATHER"
        ? await this.provider.fetchWeather(
            location,
            REQUIRED_WEATHER_OBSERVATIONS,
          )
        : await this.provider.fetchMarine(
            location,
            REQUIRED_MARINE_OBSERVATIONS,
          );
    const snapshot: SourceSnapshot = {
      locationId: location.id,
      source,
      fetchedAt: this.clock(),
      requestedFromDate: dates[0]!,
      requestedThroughDate: dates.at(-1)!,
      forecast,
    };
    this.store.appendSnapshot(snapshot);
    return snapshot;
  }
}

function selectedSnapshot<Observation extends string>(
  snapshot: SourceSnapshot,
  stale: boolean,
): SelectedSource<Observation> {
  return {
    forecast: snapshot.forecast as SourceForecast<Observation>,
    fetchedAt: snapshot.fetchedAt,
    stale,
  };
}

function describeAvailability(
  selected: SelectedSource<string>,
  targetDates: readonly LocalDate[],
): SourceAvailability {
  const { forecast } = selected;
  const freshness = {
    fetchedAt: selected.fetchedAt?.toISOString() ?? null,
    stale: selected.stale,
  };
  if (forecast === null) {
    return { state: "UNAVAILABLE", coveredDates: [], ...freshness };
  }

  const usableDates = new Set<LocalDate>();
  const observationSeries = Object.values(forecast.observations);
  forecast.localTimestamps.forEach((timestamp, index) => {
    if (observationSeries.some((series) => series[index] != null)) {
      usableDates.add(timestamp.slice(0, 10) as LocalDate);
    }
  });
  const coveredDates = targetDates.filter((date) => usableDates.has(date));
  const state: SourceState =
    coveredDates.length === targetDates.length
      ? "AVAILABLE"
      : coveredDates.length > 0
        ? "PARTIAL"
        : "NO_DATA";
  return { state, coveredDates, ...freshness };
}

function normalizeLocationQuery(query: string): string {
  return query.normalize("NFKC").trim().toLocaleLowerCase("en");
}
