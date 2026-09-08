import type { WeatherHour } from "./types.js";
import { hasConsecutive, inHourRange } from "./time.js";

export type GlobalExtreme =
  | "EXTREME_WIND"
  | "BLIZZARD_LIKE"
  | "HEAVY_FREEZING_RAIN"
  | "EXTREME_HEAT"
  | "EXTREME_COLD"
  | "HEAVY_HAIL_THUNDERSTORM";

// Preserve all established conditions internally; this is not advisory output.
export function detectGlobalExtremes(hours: WeatherHour[]): GlobalExtreme[] {
  const relevant = hours.filter((hour) => inHourRange(hour.timestamp, 6, 22));
  const extremes: GlobalExtreme[] = [];
  if (
    relevant.some((hour) => hour.windGust !== undefined && hour.windGust >= 93)
  ) {
    extremes.push("EXTREME_WIND");
  }
  if (relevant.some((hour) => hour.weatherCode === 67))
    extremes.push("HEAVY_FREEZING_RAIN");
  if (relevant.some((hour) => hour.weatherCode === 99))
    extremes.push("HEAVY_HAIL_THUNDERSTORM");
  if (
    hasConsecutive(
      relevant,
      2,
      (hour) =>
        hour.apparentTemperature !== undefined &&
        hour.apparentTemperature >= 45,
    )
  ) {
    extremes.push("EXTREME_HEAT");
  }
  if (
    hasConsecutive(
      relevant,
      2,
      (hour) =>
        hour.apparentTemperature !== undefined &&
        hour.apparentTemperature <= -30,
    )
  ) {
    extremes.push("EXTREME_COLD");
  }
  if (
    hasConsecutive(
      relevant,
      3,
      (hour) =>
        hour.snowfall !== undefined &&
        hour.snowfall > 0 &&
        hour.visibility !== undefined &&
        hour.visibility <= 400 &&
        hour.windGust !== undefined &&
        hour.windGust >= 56,
    )
  ) {
    extremes.push("BLIZZARD_LIKE");
  }
  return extremes;
}
