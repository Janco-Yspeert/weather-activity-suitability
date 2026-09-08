import type {
  ActivityRating,
  AssessmentDetail,
  Assessment,
  OrdinaryRating,
  QualityRating,
  Reason,
  ScoredHour,
} from "./types.js";

export const qualityRank: Record<OrdinaryRating, number> = {
  UNSUITABLE: 0,
  POOR: 1,
  FAIR: 2,
  GOOD: 3,
  EXCELLENT: 4,
};

const capUtility: Record<QualityRating, number> = {
  POOR: 39,
  FAIR: 59,
  GOOD: 79,
  EXCELLENT: 100,
};

export function assessment(
  rating: ActivityRating,
  reason: Reason,
  detail?: AssessmentDetail,
): Assessment {
  return detail === undefined ? { rating, reason } : { rating, reason, detail };
}

export function utilityRating(utility: number): QualityRating {
  if (utility >= 80) return "EXCELLENT";
  if (utility >= 60) return "GOOD";
  if (utility >= 40) return "FAIR";
  return "POOR";
}

export function capRating<T extends OrdinaryRating>(
  rating: T,
  cap: QualityRating,
): T | QualityRating {
  return qualityRank[rating] > qualityRank[cap] ? cap : rating;
}

export function cappedUtility(utility: number, rating: OrdinaryRating): number {
  return rating === "UNSUITABLE" ? 0 : Math.min(utility, capUtility[rating]);
}

export function median(input: number[]): number {
  const sorted = [...input].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

export function isThunderstorm(code: number): boolean {
  return code === 95 || code === 96 || code === 99;
}

export function isUsable(hour: ScoredHour): boolean {
  return qualityRank[hour.rating] >= qualityRank.FAIR;
}
