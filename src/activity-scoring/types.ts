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

export interface Assessment {
  rating: ActivityRating;
  reason: Reason;
}

export interface ActivityRatings {
  skiing: ActivityRating[];
  surfing: ActivityRating[];
  outdoorSightseeing: ActivityRating[];
  indoorSightseeing: ActivityRating[];
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
  expectedIndex?: number;
}
