export const ACTIVITY_RATINGS = [
  "UNKNOWN",
  "UNSUITABLE",
  "POOR",
  "FAIR",
  "GOOD",
  "EXCELLENT",
] as const;

export type ActivityRating = (typeof ACTIVITY_RATINGS)[number];
export type OrdinaryRating = Exclude<ActivityRating, "UNKNOWN">;
export type QualityRating = Exclude<OrdinaryRating, "UNSUITABLE">;
export type Reason =
  | "WEATHER"
  | "PREREQUISITE_ABSENT"
  | "STRUCTURAL_NON_APPLICABLE"
  | "INSUFFICIENT_DATA"
  | "GLOBAL_EXTREME";

export type AssessmentDetail =
  | "FLAT_SURF"
  | "SURF_OUTSIDE_RECREATIONAL_RANGE";

export interface Assessment {
  rating: ActivityRating;
  reason: Reason;
  detail?: AssessmentDetail;
}

export const DAILY_ADVISORY_CODES = [
  "EXTREME_WIND",
  "BLIZZARD_LIKE_CONDITIONS",
  "HEAVY_FREEZING_RAIN",
  "EXTREME_HEAT",
  "EXTREME_COLD",
  "HEAVY_HAIL_THUNDERSTORM",
  "SKIING_NO_SNOW",
  "LARGE_SURF",
  "NO_SURF",
] as const;

export type DailyAdvisoryCode = (typeof DAILY_ADVISORY_CODES)[number];
export interface DailyAdvisory {
  date: string;
  codes: DailyAdvisoryCode[];
}

export const FORECAST_ADVISORY_CODES = [
  "SURFING_NOT_APPLICABLE",
  "SKIING_NO_SNOW_FORECAST",
] as const;
export type ForecastAdvisoryCode = (typeof FORECAST_ADVISORY_CODES)[number];

export interface ActivityRatings {
  skiing: ActivityRating[];
  surfing: ActivityRating[];
  outdoorSightseeing: ActivityRating[];
  indoorSightseeing: ActivityRating[];
  dailyAdvisories: DailyAdvisory[];
  forecastAdvisories: ForecastAdvisoryCode[];
}

// Canonical partial evidence. Non-finite provider values are absent here.
export interface WeatherHour {
  timestamp: string;
  airTemperature: number | undefined;
  apparentTemperature: number | undefined;
  precipitation: number | undefined;
  rain: number | undefined;
  snowfall: number | undefined;
  snowDepth: number | undefined;
  windSpeed: number | undefined;
  windGust: number | undefined;
  visibility: number | undefined;
  weatherCode: number | undefined;
  cloudCover: number | undefined;
}

export interface MarineHour {
  timestamp: string;
  waveHeight: number | undefined;
  swellPeriod: number | undefined;
  wavePeriod: number | undefined;
}

export type MarineEvidence =
  "UNAVAILABLE" | "STRUCTURAL_NON_APPLICABLE" | "AVAILABLE";

export interface ScoredHour {
  timestamp: string;
  rating: OrdinaryRating;
  utility: number;
}
