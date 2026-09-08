import type {
  Assessment,
  OrdinaryRating,
  QualityRating,
  ScoredHour,
  WeatherHour,
} from "./types.js";
import {
  assessment,
  capRating,
  cappedUtility,
  isUsable,
  median,
  utilityRating,
} from "./utility.js";
import {
  alignToExpectedSlots,
  contiguousBlocks,
  expectedHourlySlots,
} from "./time.js";

interface SkiHour {
  timestamp: string;
  airTemperature: number;
  snowfall: number;
  snowDepth: number;
  windSpeed: number;
  visibility: number;
  weatherCode: number;
  rain: number;
  cloudCover: number | undefined;
}

type SkiEvidence =
  | { kind: "INSUFFICIENT_DATA" | "PREREQUISITE_ABSENT" }
  | {
      kind: "SCORABLE";
      hours: SkiHour[];
      expectedHours: number;
      periodSufficient: boolean;
    };

export function scoreSki(
  hours: WeatherHour[],
  date: string,
): Assessment {
  const evidence = assessSkiEvidence(hours, date);
  if (evidence.kind === "PREREQUISITE_ABSENT") {
    return assessment("UNSUITABLE", "PREREQUISITE_ABSENT");
  }
  if (evidence.kind !== "SCORABLE")
    return assessment("UNKNOWN", "INSUFFICIENT_DATA");
  return evidence.periodSufficient
    ? scoreSkiDay(evidence.hours, evidence.expectedHours)
    : scorePartialSki(evidence.hours);
}

function assessSkiEvidence(
  hours: WeatherHour[],
  date: string,
): SkiEvidence {
  const expectedSlots = expectedHourlySlots(`${date}T08:00`, `${date}T17:00`);
  if (expectedSlots.length === 0) return { kind: "INSUFFICIENT_DATA" };
  const aligned = alignToExpectedSlots(hours, expectedSlots);

  // Snow alone can establish the prerequisite failure even when ordinary
  // weather fields are missing. Both denominators use the expected period.
  const snowDepths = aligned.flatMap((hour) =>
    hour?.snowDepth === undefined ? [] : [hour.snowDepth],
  );
  const enoughSnowEvidence = snowDepths.length / expectedSlots.length >= 0.7;
  if (enoughSnowEvidence && median(snowDepths) < 0.01)
    return { kind: "PREREQUISITE_ABSENT" };

  const complete: SkiHour[] = aligned.flatMap((hour) => {
    if (hour === undefined) return [];
    const {
      timestamp,
      airTemperature,
      snowfall,
      snowDepth,
      windSpeed,
      visibility,
      weatherCode,
      rain,
      cloudCover,
    } = hour;
    if (
      airTemperature === undefined ||
      snowfall === undefined ||
      snowDepth === undefined ||
      windSpeed === undefined ||
      visibility === undefined ||
      weatherCode === undefined ||
      rain === undefined
    )
      return [];
    return [
      {
        timestamp,
        airTemperature,
        snowfall,
        snowDepth,
        windSpeed,
        visibility,
        weatherCode,
        rain,
        cloudCover,
      },
    ];
  });
  return {
    kind: "SCORABLE",
    hours: complete,
    expectedHours: expectedSlots.length,
    periodSufficient:
      complete.length / expectedSlots.length >= 0.7 && enoughSnowEvidence,
  };
}

// Ordinary aggregation may use whole-period snow and temperature medians.
function scoreSkiDay(scorable: SkiHour[], expectedHours: number): Assessment {
  const snowDepth = median(scorable.map((hour) => hour.snowDepth));
  const snow = snowDepthUtility(snowDepth);
  const scored = scorable.map((point) => scoreSkiHour(point, snow.utility));
  const usableFraction = scored.filter(isUsable).length / expectedHours;
  const blocks = contiguousBlocks(scored.filter(isUsable), 4);
  const blockScores = blocks.map((block) =>
    Math.round(
      block.reduce((sum, hour) => sum + hour.utility, 0) / block.length,
    ),
  );

  let rating: OrdinaryRating;
  if (blockScores.length > 0) {
    const best = utilityRating(Math.max(...blockScores));
    if (best === "EXCELLENT")
      rating = usableFraction >= 0.75 ? "EXCELLENT" : "GOOD";
    else if (best === "GOOD") rating = usableFraction >= 0.6 ? "GOOD" : "FAIR";
    else rating = "FAIR";
  } else if (
    scored.some(isUsable) ||
    scored.some(({ rating: value }) => value === "POOR")
  ) {
    rating = "POOR";
  } else {
    rating = "UNSUITABLE";
  }

  rating = capRating(rating, snow.cap);
  const medianTemperature = median(scorable.map((hour) => hour.airTemperature));
  if (medianTemperature > 10 && snowDepth < 0.1) rating = "UNSUITABLE";
  else if (medianTemperature > 7 && snowDepth < 0.15)
    rating = capRating(rating, "POOR");
  return assessment(rating, "WEATHER");
}

function scorePartialSki(scorable: SkiHour[]): Assessment {
  let best:
    | { utility: number; rating: QualityRating; snowCap: QualityRating }
    | undefined;

  for (const block of contiguousBlocks(scorable, 4)) {
    const snow = snowDepthUtility(median(block.map((hour) => hour.snowDepth)));
    if (snow.utility < 50) continue;
    const scored = block.map((point) => scoreSkiHour(point, snow.utility));
    if (!scored.every(isUsable)) continue;

    const utility = Math.round(
      scored.reduce((sum, hour) => sum + hour.utility, 0) / scored.length,
    );
    const rating = utilityRating(utility);
    if (best === undefined || utility > best.utility) {
      best = { utility, rating, snowCap: snow.cap };
    }
  }

  if (best === undefined) return assessment("UNKNOWN", "INSUFFICIENT_DATA");
  const fallback = best.rating === "EXCELLENT" ? "GOOD" : "FAIR";
  return assessment(capRating(fallback, best.snowCap), "WEATHER");
}

function scoreSkiHour(point: SkiHour, snowUtility: number): ScoredHour {
  const temperature = point.airTemperature;
  const wind = point.windSpeed;
  const visibility = point.visibility;
  const snowfall = point.snowfall;
  const rain = point.rain;
  const weatherCode = point.weatherCode;
  const cloud = point.cloudCover;
  const temperatureScore = skiTemperatureUtility(temperature);
  const windScore = skiWindUtility(wind);
  const weatherScore = Math.min(
    snowfallUtility(snowfall),
    skiVisibilityUtility(visibility),
  );
  const weighted =
    snowUtility * 0.35 +
    weatherScore * 0.25 +
    windScore * 0.2 +
    temperatureScore * 0.15;
  let utility = Math.round(
    cloud === undefined
      ? weighted / 0.95
      : weighted + cloudUtility(cloud) * 0.05,
  );

  if (wind >= 50 || visibility < 500 || rain > 2) {
    return {
      timestamp: point.timestamp,
      rating: "UNSUITABLE",
      utility: 0,
    };
  }

  let rating: OrdinaryRating = utilityRating(utility);
  if (temperatureScore === 0) rating = capRating(rating, "POOR");
  if (rain > 0.5 || weatherCode === 66) rating = capRating(rating, "POOR");
  else if (rain > 0) rating = capRating(rating, "FAIR");
  utility = cappedUtility(utility, rating);
  return {
    timestamp: point.timestamp,
    rating,
    utility,
  };
}

function snowDepthUtility(value: number): {
  utility: number;
  cap: QualityRating;
} {
  if (value < 0.01) return { utility: 0, cap: "POOR" };
  if (value < 0.05) return { utility: 25, cap: "POOR" };
  if (value < 0.15) return { utility: 50, cap: "FAIR" };
  if (value < 0.3) return { utility: 75, cap: "GOOD" };
  return { utility: 100, cap: "EXCELLENT" };
}

function skiTemperatureUtility(value: number): number {
  if (value >= -5 && value <= 3) return 100;
  if ((value >= -10 && value < -5) || (value > 3 && value <= 7)) return 75;
  if ((value >= -15 && value < -10) || (value > 7 && value <= 10)) return 50;
  if ((value >= -20 && value < -15) || (value > 10 && value <= 15)) return 25;
  return 0;
}

function skiVisibilityUtility(value: number): number {
  if (value >= 10_000) return 100;
  if (value >= 5_000) return 75;
  if (value >= 2_000) return 50;
  if (value >= 1_000) return 25;
  return 0;
}

function snowfallUtility(value: number): number {
  if (value <= 0.5) return 100;
  if (value <= 1.5) return 75;
  if (value <= 3) return 50;
  if (value <= 5) return 25;
  return 0;
}

function cloudUtility(value: number): number {
  if (value < 25) return 100;
  if (value <= 50) return 75;
  if (value <= 75) return 50;
  return 25;
}

function skiWindUtility(value: number): number {
  if (value < 12) return 100;
  if (value < 20) return 75;
  if (value < 30) return 50;
  if (value < 40) return 25;
  return 0;
}
