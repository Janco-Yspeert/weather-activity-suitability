import { forecastCoverage, getTargetDates, type LocalDate } from "./forecast-policy.js";
import type { ForecastData, ResolvedLocation } from "./open-meteo.js";

export interface ForecastProvider {
  resolveLocation(query: string): Promise<ResolvedLocation>;
  fetchForecast(location: ResolvedLocation): Promise<ForecastData>;
}

export type ActivityRating = "UNKNOWN" | "UNSUITABLE" | "POOR" | "FAIR" | "GOOD" | "EXCELLENT";

export interface ForecastAssessment {
  metadata: {
    fetchedAt: string;
    forecastCoveredDates: LocalDate[];
    hasRequiredCoverage: boolean;
  };
  location: ResolvedLocation;
  dates: LocalDate[];
  skiing: ActivityRating[];
  surfing: ActivityRating[];
  outdoorSightseeing: ActivityRating[];
  indoorSightseeing: ActivityRating[];
}

interface FetchedForecast {
  fetchedAt: Date;
  coveredDates: Set<LocalDate>;
}

export class ForecastService {
  private readonly inFlightForecasts = new Map<string, Promise<FetchedForecast>>();

  constructor(
    private readonly provider: ForecastProvider,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async assess(query: string): Promise<ForecastAssessment> {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length === 0) throw new Error("Location must not be empty");

    const location = await this.provider.resolveLocation(normalizedQuery);
    const dates = getTargetDates(this.clock(), location.timezone);
    const forecast = await this.refresh(location);
    const forecastCoveredDates = [...forecast.coveredDates].sort();
    const hasRequiredCoverage = dates.every((date) => forecast.coveredDates.has(date));
    const placeholders = (): ActivityRating[] => dates.map(() => "UNKNOWN");

    return {
      metadata: {
        fetchedAt: forecast.fetchedAt.toISOString(),
        forecastCoveredDates,
        hasRequiredCoverage,
      },
      location,
      dates,
      skiing: placeholders(),
      surfing: placeholders(),
      outdoorSightseeing: placeholders(),
      indoorSightseeing: placeholders(),
    };
  }

  private async refresh(location: ResolvedLocation): Promise<FetchedForecast> {
    const existing = this.inFlightForecasts.get(location.id);
    if (existing) return existing;

    const refresh = this.fetchAndDescribe(location);
    this.inFlightForecasts.set(location.id, refresh);
    try {
      return await refresh;
    } finally {
      if (this.inFlightForecasts.get(location.id) === refresh) {
        this.inFlightForecasts.delete(location.id);
      }
    }
  }

  private async fetchAndDescribe(location: ResolvedLocation): Promise<FetchedForecast> {
    const forecast = await this.provider.fetchForecast(location);
    return {
      fetchedAt: this.clock(),
      coveredDates: forecastCoverage(forecast.localTimestamps),
    };
  }
}
