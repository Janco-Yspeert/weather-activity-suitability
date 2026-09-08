import type { SolarDay } from "../open-meteo.js";
import type {
  Assessment,
  MarineEvidence,
  MarineHour,
  OrdinaryRating,
  QualityRating,
  ScoredHour,
  WeatherHour,
} from "./types.js";
import {
  assessment,
  capRating,
  cappedUtility,
  isThunderstorm,
  isUsable,
  qualityRank,
  utilityRating,
} from "./utility.js";
import {
  alignToExpectedSlots,
  areConsecutive,
  expectedHourlySlots,
  shiftMinutes,
} from "./time.js";

interface SurfHour {
  timestamp: string;
  waveHeight: number;
  swellPeriod: number;
  wavePeriod: number;
  windSpeed: number;
  weatherCode: number;
}

interface SurfOpportunity {
  rating: QualityRating;
  score: number;
  duration: number;
  start: string;
}

type SurfEvidence =
  | { kind: "STRUCTURAL_NON_APPLICABLE" | "INSUFFICIENT_DATA" }
  | { kind: "SCORABLE"; hours: SurfHour[]; periodSufficient: boolean };

export function scoreSurf(
  weather: WeatherHour[],
  marine: MarineHour[],
  solar: SolarDay | undefined,
  marineEvidence: MarineEvidence,
): Assessment {
  const evidence = assessSurfEvidence(
    weather,
    marine,
    solar,
    marineEvidence,
  );
  if (evidence.kind === "STRUCTURAL_NON_APPLICABLE") {
    return assessment("UNSUITABLE", "STRUCTURAL_NON_APPLICABLE");
  }
  if (evidence.kind !== "SCORABLE")
    return assessment("UNKNOWN", "INSUFFICIENT_DATA");

  if (
    evidence.periodSufficient &&
    evidence.hours.every(({ waveHeight }) => waveHeight < 0.3)
  ) {
    return assessment("UNSUITABLE", "WEATHER", "FLAT_SURF");
  }

  const scored = evidence.hours.map(scoreSurfHour);
  const opportunities = surfOpportunities(scored).sort(compareOpportunities);
  if (!evidence.periodSufficient) {
    if (opportunities.length === 0)
      return assessment("UNKNOWN", "INSUFFICIENT_DATA");
    // A complete observed session supports a positive fallback, without a
    // second-opportunity bonus or assumptions about the unobserved period.
    return assessment(
      capRating(surfDaily([opportunities[0]!]), "GOOD"),
      "WEATHER",
    );
  }
  if (opportunities.length === 0) {
    const rating = scored.every(({ rating }) => rating === "UNSUITABLE")
      ? "UNSUITABLE"
      : "POOR";
    return assessment(
      rating,
      "WEATHER",
      rating === "UNSUITABLE" &&
        evidence.hours.some(isOutsideRecreationalSurfRange)
        ? "SURF_OUTSIDE_RECREATIONAL_RANGE"
        : undefined,
    );
  }
  return assessment(surfDaily(opportunities), "WEATHER");
}

function isOutsideRecreationalSurfRange(hour: SurfHour): boolean {
  return (
    hour.waveHeight >= 4 ||
    (hour.waveHeight >= 3.5 && hour.swellPeriod >= 12)
  );
}

function assessSurfEvidence(
  weather: WeatherHour[],
  marine: MarineHour[],
  solar: SolarDay | undefined,
  marineEvidence: MarineEvidence,
): SurfEvidence {
  if (marineEvidence === "STRUCTURAL_NON_APPLICABLE") {
    return { kind: "STRUCTURAL_NON_APPLICABLE" };
  }
  if (
    marineEvidence === "UNAVAILABLE" ||
    solar?.sunrise == null ||
    solar.sunset == null
  ) {
    return { kind: "INSUFFICIENT_DATA" };
  }
  const expectedSlots = expectedHourlySlots(
    shiftMinutes(solar.sunrise, -90),
    shiftMinutes(solar.sunset, 60),
  );
  if (expectedSlots.length === 0) return { kind: "INSUFFICIENT_DATA" };
  const alignedWeather = alignToExpectedSlots(weather, expectedSlots);
  const alignedMarine = alignToExpectedSlots(marine, expectedSlots);
  const hours: SurfHour[] = expectedSlots.flatMap(
    (timestamp, index) => {
      const weatherHour = alignedWeather[index];
      const marineHour = alignedMarine[index];
      if (weatherHour === undefined || marineHour === undefined) return [];
      const { windSpeed, weatherCode } = weatherHour;
      const { waveHeight, swellPeriod, wavePeriod } = marineHour;
      if (
        windSpeed === undefined ||
        weatherCode === undefined ||
        waveHeight === undefined ||
        swellPeriod === undefined ||
        wavePeriod === undefined
      )
        return [];
      return [
        {
          timestamp,
          windSpeed,
          weatherCode,
          waveHeight,
          swellPeriod,
          wavePeriod,
        },
      ];
    },
  );
  return {
    kind: "SCORABLE",
    hours,
    periodSufficient: hours.length / expectedSlots.length >= 0.7,
  };
}

function scoreSurfHour(hour: SurfHour): ScoredHour {
  const waveHeight = hour.waveHeight;
  const swellPeriod = hour.swellPeriod;
  const wavePeriod = hour.wavePeriod;
  const wind = hour.windSpeed;
  const weatherCode = hour.weatherCode;
  let utility = Math.round(
    waveUtility(waveHeight) * 0.45 +
      swellUtility(swellPeriod) * 0.3 +
      surfWindUtility(wind) * 0.25 +
      (wavePeriod / swellPeriod >= 0.85
        ? 0
        : wavePeriod / swellPeriod >= 0.7
          ? -5
          : -10),
  );

  if (
    isThunderstorm(weatherCode) ||
    waveHeight >= 4 ||
    (waveHeight >= 3.5 && swellPeriod >= 12) ||
    wind >= 50
  ) {
    return {
      timestamp: hour.timestamp,
      rating: "UNSUITABLE",
      utility: 0,
    };
  }

  let rating: OrdinaryRating = utilityRating(utility);
  if (waveHeight < 0.3) rating = capRating(rating, "POOR");
  if (waveHeight >= 3 && swellPeriod >= 12) rating = capRating(rating, "POOR");
  utility = cappedUtility(utility, rating);
  return {
    timestamp: hour.timestamp,
    rating,
    utility,
  };
}

function surfOpportunities(hours: ScoredHour[]): SurfOpportunity[] {
  const runs: ScoredHour[][] = [];
  let current: ScoredHour[] | undefined;
  for (const hour of hours) {
    if (!isUsable(hour)) {
      current = undefined;
      continue;
    }
    if (current === undefined || !areConsecutive(current.at(-1)!, hour)) {
      current = [hour];
      runs.push(current);
    } else {
      current.push(hour);
    }
  }
  return runs.filter((run) => run.length >= 2).map(scoreSurfOpportunity);
}

// Overlapping two-hour sessions determine quality inside one maximal run;
// they cannot manufacture a second daily opportunity.
function scoreSurfOpportunity(run: ScoredHour[]): SurfOpportunity {
  let score = -1;
  for (let index = 0; index < run.length - 1; index += 1) {
    score = Math.max(
      score,
      Math.round((run[index]!.utility + run[index + 1]!.utility) / 2),
    );
  }
  return {
    rating: utilityRating(score),
    score,
    duration: run.length,
    start: run[0]!.timestamp,
  };
}

function compareOpportunities(
  left: SurfOpportunity,
  right: SurfOpportunity,
): number {
  return (
    qualityRank[right.rating] - qualityRank[left.rating] ||
    right.score - left.score ||
    right.duration - left.duration ||
    left.start.localeCompare(right.start)
  );
}

function surfDaily(opportunities: SurfOpportunity[]): QualityRating {
  const best = opportunities[0]!;
  const second = opportunities[1];
  if (second !== undefined) {
    if (best.rating === "EXCELLENT" && second.rating === "EXCELLENT")
      return "EXCELLENT";
    if (best.rating === "EXCELLENT" && second.rating === "GOOD")
      return "EXCELLENT";
    if (best.rating === "EXCELLENT" && second.rating === "FAIR") return "GOOD";
    if (best.rating === "GOOD") return "GOOD";
    return "FAIR";
  }
  if (best.rating === "EXCELLENT")
    return best.duration >= 4 ? "EXCELLENT" : "GOOD";
  if (best.rating === "GOOD") return best.duration >= 3 ? "GOOD" : "FAIR";
  return "FAIR";
}

function waveUtility(value: number): number {
  if (value < 0.3) return 0;
  if (value < 0.6) return 25;
  if (value < 0.9) return 50;
  if (value <= 1.8) return 100;
  if (value <= 2.5) return 75;
  if (value <= 3) return 50;
  if (value < 4) return 25;
  return 0;
}

function swellUtility(value: number): number {
  if (value < 5) return 0;
  if (value < 7) return 25;
  if (value < 9) return 50;
  if (value < 12) return 75;
  return 100;
}

function surfWindUtility(value: number): number {
  if (value < 10) return 100;
  if (value < 20) return 75;
  if (value < 30) return 50;
  if (value < 40) return 25;
  return 0;
}
