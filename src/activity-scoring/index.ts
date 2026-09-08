import type {
  MarineObservation,
  SourceForecast,
  WeatherObservation,
} from "../open-meteo.js";
import type { ActivityRatings, DailyAdvisoryCode } from "./types.js";
import { weatherHours, marineHours, assessMarineEvidence } from "./forecast.js";
import { detectGlobalExtremes } from "./global-extremes.js";
import { scoreOutdoor } from "./outdoor.js";
import { scoreSurf } from "./surf.js";
import { scoreSki } from "./ski.js";
import { scoreIndoor } from "./indoor.js";

export {
  ACTIVITY_RATINGS,
  DAILY_ADVISORY_CODES,
  FORECAST_ADVISORY_CODES,
} from "./types.js";
export type {
  ActivityRating,
  ActivityRatings,
  DailyAdvisory,
  DailyAdvisoryCode,
  ForecastAdvisoryCode,
} from "./types.js";

const globalAdvisoryCodes = {
  EXTREME_WIND: "EXTREME_WIND",
  BLIZZARD_LIKE: "BLIZZARD_LIKE_CONDITIONS",
  HEAVY_FREEZING_RAIN: "HEAVY_FREEZING_RAIN",
  EXTREME_HEAT: "EXTREME_HEAT",
  EXTREME_COLD: "EXTREME_COLD",
  HEAVY_HAIL_THUNDERSTORM: "HEAVY_HAIL_THUNDERSTORM",
} as const satisfies Record<
  ReturnType<typeof detectGlobalExtremes>[number],
  DailyAdvisoryCode
>;

export function scoreActivities(
  weather: SourceForecast<WeatherObservation> | null,
  marine: SourceForecast<MarineObservation> | null,
  dates: readonly string[],
): ActivityRatings {
  const weatherEvidence = weatherHours(weather);
  const marineHoursForForecast = marineHours(marine);
  const marineEvidence = assessMarineEvidence(marine);
  const solarByDate = new Map(
    (weather?.solarDays ?? []).map((day) => [day.date, day]),
  );
  const ratings: ActivityRatings = {
    skiing: [],
    surfing: [],
    outdoorSightseeing: [],
    indoorSightseeing: [],
    dailyAdvisories: [],
    forecastAdvisories:
      marineEvidence === "STRUCTURAL_NON_APPLICABLE"
        ? ["SURFING_NOT_APPLICABLE"]
        : [],
  };
  const noSnowDates = new Set<string>();

  for (const date of dates) {
    const dayWeather = weatherEvidence.filter((hour) =>
      hour.timestamp.startsWith(`${date}T`),
    );
    const globalExtremes = detectGlobalExtremes(dayWeather);
    if (globalExtremes.length > 0) {
      ratings.skiing.push("UNSUITABLE");
      ratings.surfing.push("UNSUITABLE");
      ratings.outdoorSightseeing.push("UNSUITABLE");
      ratings.indoorSightseeing.push("UNSUITABLE");
      ratings.dailyAdvisories.push({
        date,
        codes: globalExtremes.map((extreme) => globalAdvisoryCodes[extreme]),
      });
      continue;
    }

    const outdoor = scoreOutdoor(dayWeather);
    const surf = scoreSurf(
      dayWeather,
      marineHoursForForecast.filter((hour) =>
        hour.timestamp.startsWith(`${date}T`),
      ),
      solarByDate.get(date),
      marineEvidence,
    );
    const ski = scoreSki(dayWeather, date);
    const indoor = scoreIndoor(outdoor, ski, surf);

    const advisoryCodes: DailyAdvisoryCode[] = [];
    if (ski.reason === "PREREQUISITE_ABSENT") {
      advisoryCodes.push("SKIING_NO_SNOW");
      noSnowDates.add(date);
    }
    if (surf.detail === "SURF_OUTSIDE_RECREATIONAL_RANGE")
      advisoryCodes.push("LARGE_SURF");
    if (surf.detail === "FLAT_SURF") advisoryCodes.push("NO_SURF");
    if (advisoryCodes.length > 0)
      ratings.dailyAdvisories.push({ date, codes: advisoryCodes });

    ratings.outdoorSightseeing.push(outdoor.rating);
    ratings.surfing.push(surf.rating);
    ratings.skiing.push(ski.rating);
    ratings.indoorSightseeing.push(indoor.rating);
  }

  if (dates.length > 0 && noSnowDates.size === dates.length) {
    ratings.forecastAdvisories.push("SKIING_NO_SNOW_FORECAST");
    ratings.dailyAdvisories = ratings.dailyAdvisories.flatMap((advisory) => {
      const codes = advisory.codes.filter((code) => code !== "SKIING_NO_SNOW");
      return codes.length === 0 ? [] : [{ ...advisory, codes }];
    });
  }
  return ratings;
}
