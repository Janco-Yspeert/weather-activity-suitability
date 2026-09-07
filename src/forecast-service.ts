import { getTargetDates, type LocalDate } from "./forecast-policy.js";
import { ProviderError } from "./open-meteo.js";
import type {
  MarineObservation,
  ResolvedLocation,
  SourceForecast,
  WeatherObservation,
} from "./open-meteo.js";

const REQUIRED_WEATHER_OBSERVATIONS = ["airTemperature"] as const satisfies readonly WeatherObservation[];
const REQUIRED_MARINE_OBSERVATIONS = ["waveHeight"] as const satisfies readonly MarineObservation[];

export interface ForecastProvider {
  resolveLocation(query: string): Promise<ResolvedLocation>;
  fetchWeather(
    location: ResolvedLocation,
    observations: readonly WeatherObservation[],
  ): Promise<SourceForecast>;
  fetchMarine(
    location: ResolvedLocation,
    observations: readonly MarineObservation[],
  ): Promise<SourceForecast>;
}

export type ActivityRating = "UNKNOWN" | "UNSUITABLE" | "POOR" | "FAIR" | "GOOD" | "EXCELLENT";
export type SourceState = "AVAILABLE" | "PARTIAL" | "NO_DATA" | "UNAVAILABLE";

export interface SourceAvailability {
  state: SourceState;
  coveredDates: LocalDate[];
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
}

interface FetchedSources {
  weather: SourceForecast | null;
  marine: SourceForecast | null;
}

export class ForecastService {
  private readonly inFlightForecasts = new Map<string, Promise<FetchedSources>>();

  constructor(
    private readonly provider: ForecastProvider,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async assess(query: string): Promise<ForecastAssessment> {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length === 0) throw new Error("Location must not be empty");

    const location = await this.provider.resolveLocation(normalizedQuery);
    const dates = getTargetDates(this.clock(), location.timezone);
    const sources = await this.refresh(location);
    const placeholders = (): ActivityRating[] => dates.map(() => "UNKNOWN");

    return {
      metadata: {
        weather: describeAvailability(sources.weather, dates),
        marine: describeAvailability(sources.marine, dates),
      },
      location,
      dates,
      skiing: placeholders(),
      surfing: placeholders(),
      outdoorSightseeing: placeholders(),
      indoorSightseeing: placeholders(),
    };
  }

  private async refresh(location: ResolvedLocation): Promise<FetchedSources> {
    const existing = this.inFlightForecasts.get(location.id);
    if (existing) return existing;

    const refresh = this.fetchSources(location);
    this.inFlightForecasts.set(location.id, refresh);
    try {
      return await refresh;
    } finally {
      if (this.inFlightForecasts.get(location.id) === refresh) {
        this.inFlightForecasts.delete(location.id);
      }
    }
  }

  private async fetchSources(location: ResolvedLocation): Promise<FetchedSources> {
    const [weather, marine] = await Promise.all([
      asSourceOutcome(this.provider.fetchWeather(location, REQUIRED_WEATHER_OBSERVATIONS)),
      asSourceOutcome(this.provider.fetchMarine(location, REQUIRED_MARINE_OBSERVATIONS)),
    ]);
    return { weather, marine };
  }
}

async function asSourceOutcome(request: Promise<SourceForecast>): Promise<SourceForecast | null> {
  try {
    return await request;
  } catch (error) {
    if (error instanceof ProviderError) return null;
    throw error;
  }
}

function describeAvailability(
  forecast: SourceForecast | null,
  targetDates: readonly LocalDate[],
): SourceAvailability {
  if (forecast === null) return { state: "UNAVAILABLE", coveredDates: [] };

  const usableDates = new Set<LocalDate>();
  const observationSeries = Object.values(forecast.observations);
  forecast.localTimestamps.forEach((timestamp, index) => {
    if (observationSeries.some((series) => series[index] != null)) {
      usableDates.add(timestamp.slice(0, 10) as LocalDate);
    }
  });
  const coveredDates = targetDates.filter((date) => usableDates.has(date));
  const state: SourceState =
    coveredDates.length === targetDates.length ? "AVAILABLE" : coveredDates.length > 0 ? "PARTIAL" : "NO_DATA";
  return { state, coveredDates };
}
