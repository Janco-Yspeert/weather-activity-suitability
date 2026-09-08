import type {
  Assessment,
  OrdinaryRating,
  ScoredHour,
  WeatherHour,
} from "./types.js";
import {
  assessment,
  capRating,
  cappedUtility,
  isThunderstorm,
  median,
  qualityRank,
  utilityRating,
} from "./utility.js";
import { inHourRange, shiftHours } from "./time.js";

interface OutdoorHour {
  timestamp: string;
  apparentTemperature: number;
  precipitation: number;
  windSpeed: number;
  visibility: number;
  weatherCode: number;
  windGust: number | undefined;
}

interface OutdoorEvidence {
  hours: OutdoorHour[];
  windows: OutdoorHour[][];
}

export function scoreOutdoor(hours: WeatherHour[]): Assessment {
  const evidence = assessOutdoorEvidence(hours);
  const windows = evidence.windows.map(scoreOutdoorWindow);
  if (windows.length === 0) return assessment("UNKNOWN", "INSUFFICIENT_DATA");
  if (windows.every(({ rating }) => rating === "UNSUITABLE")) {
    return assessment("UNSUITABLE", "WEATHER");
  }

  const best = windows.reduce((left, right) =>
    qualityRank[right.rating] > qualityRank[left.rating] ? right : left,
  );
  const usableHours = evidence.hours.filter(
    (point) => scoreOutdoorHour(point) >= 40,
  ).length;

  return assessment(outdoorDaily(best.rating, usableHours), "WEATHER");
}

function assessOutdoorEvidence(hours: WeatherHour[]): OutdoorEvidence {
  const relevant = hours.filter((hour) => inHourRange(hour.timestamp, 8, 18));
  const complete = relevant.flatMap((hour) => {
    const {
      apparentTemperature,
      precipitation,
      windSpeed,
      visibility,
      weatherCode,
      windGust,
      timestamp,
    } = hour;
    if (
      apparentTemperature === undefined ||
      precipitation === undefined ||
      windSpeed === undefined ||
      visibility === undefined ||
      weatherCode === undefined
    )
      return [];
    return [
      {
        timestamp,
        apparentTemperature,
        precipitation,
        windSpeed,
        visibility,
        weatherCode,
        windGust,
      },
    ];
  });
  const byTime = new Map(complete.map((hour) => [hour.timestamp, hour]));
  const windows: OutdoorHour[][] = [];
  for (const hour of relevant) {
    const first = byTime.get(hour.timestamp);
    const second = byTime.get(shiftHours(hour.timestamp, 1));
    const third = byTime.get(shiftHours(hour.timestamp, 2));
    if (first !== undefined && second !== undefined && third !== undefined) {
      windows.push([first, second, third]);
    }
  }
  return { hours: [...byTime.values()], windows };
}

function scoreOutdoorWindow(points: OutdoorHour[]): ScoredHour {
  const temperatures = points.map((hour) => hour.apparentTemperature);
  const precipitation = points.map((hour) => hour.precipitation);
  const wind = points.map((hour) => hour.windSpeed);
  const visibility = points.map((hour) => hour.visibility);
  const weatherCodes = points.map((hour) => hour.weatherCode);
  const thermal = outdoorTemperatureUtility(median(temperatures));
  const precipitationScore = precipitationUtility(precipitation);
  const windScore = outdoorWindUtility(median(wind));
  const visibilityScore = outdoorVisibilityUtility(median(visibility));
  const utility = Math.round(
    thermal * 0.35 +
      precipitationScore * 0.3 +
      windScore * 0.2 +
      visibilityScore * 0.15,
  );

  if (
    weatherCodes.some(isThunderstorm) ||
    visibility.some((value) => value < 200)
  ) {
    return {
      timestamp: points[0]!.timestamp,
      rating: "UNSUITABLE",
      utility: 0,
    };
  }

  let rating: OrdinaryRating = utilityRating(utility);
  if (thermal === 0 || precipitationScore === 0 || windScore === 0) {
    rating = capRating(rating, "POOR");
  }
  if (visibility.filter((value) => value < 500).length >= 2) {
    rating = capRating(rating, "POOR");
  }
  const gusts = points.flatMap((hour) =>
    hour.windGust === undefined ? [] : [hour.windGust],
  );
  if (gusts.some((value) => value >= 80)) rating = capRating(rating, "POOR");
  else if (gusts.some((value) => value >= 70))
    rating = capRating(rating, "FAIR");

  return {
    timestamp: points[0]!.timestamp,
    rating,
    utility: cappedUtility(utility, rating),
  };
}

function scoreOutdoorHour(point: OutdoorHour): number {
  const weatherCode = point.weatherCode;
  if (isThunderstorm(weatherCode)) return -1;
  return Math.round(
    outdoorTemperatureUtility(point.apparentTemperature) * 0.35 +
      precipitationUtility([point.precipitation]) * 0.3 +
      outdoorWindUtility(point.windSpeed) * 0.2 +
      outdoorVisibilityUtility(point.visibility) * 0.15,
  );
}

function outdoorDaily(
  best: OrdinaryRating,
  usableHours: number,
): OrdinaryRating {
  if (best === "UNSUITABLE" || best === "POOR") return best;
  if (best === "EXCELLENT") {
    if (usableHours >= 6) return "EXCELLENT";
    if (usableHours >= 3) return "GOOD";
    return "FAIR";
  }
  if (best === "GOOD") {
    if (usableHours >= 5) return "GOOD";
    if (usableHours >= 3) return "FAIR";
    return "POOR";
  }
  return usableHours >= 3 ? "FAIR" : "POOR";
}

function precipitationUtility(input: number[]): number {
  const total = input.reduce((sum, value) => sum + value, 0);
  const wetHours = input.filter((value) => value > 0.1).length;
  const maximum = Math.max(...input);
  if (total <= 0.2) return 100;
  if (total <= 1.5 && wetHours <= 1 && maximum <= 1.5) return 75;
  if (total <= 3 && maximum <= 2) return 50;
  if (total <= 6 && maximum <= 4) return 25;
  return 0;
}

function outdoorTemperatureUtility(value: number): number {
  if (value >= 18 && value <= 27) return 100;
  if ((value >= 12 && value < 18) || (value > 27 && value <= 32)) return 75;
  if ((value >= 5 && value < 12) || (value > 32 && value <= 36)) return 50;
  if ((value >= 0 && value < 5) || (value > 36 && value <= 40)) return 25;
  return 0;
}

function outdoorVisibilityUtility(value: number): number {
  if (value >= 10_000) return 100;
  if (value >= 5_000) return 75;
  if (value >= 2_000) return 50;
  if (value >= 500) return 25;
  return 0;
}

function outdoorWindUtility(value: number): number {
  if (value < 20) return 100;
  if (value < 30) return 75;
  if (value < 40) return 50;
  if (value < 50) return 25;
  return 0;
}
