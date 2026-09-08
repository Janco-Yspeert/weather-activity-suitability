import type {
  MarineObservation,
  SourceForecast,
  WeatherObservation,
} from "../open-meteo.js";
import type { ActivityRatings } from "./types.js";
import { weatherHours, marineHours, assessMarineEvidence } from "./forecast.js";
import { detectGlobalExtremes } from "./global-extremes.js";
import { scoreOutdoor } from "./outdoor.js";
import { scoreSurf } from "./surf.js";
import { scoreSki } from "./ski.js";
import { scoreIndoor } from "./indoor.js";

export { ACTIVITY_RATINGS } from "./types.js";
export type { ActivityRating, ActivityRatings } from "./types.js";

export function scoreActivities(
  weather: SourceForecast<WeatherObservation> | null,
  marine: SourceForecast<MarineObservation> | null,
  dates: readonly string[],
  timeZone = "UTC",
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
  };

  for (const date of dates) {
    const dayWeather = weatherEvidence.filter((hour) =>
      hour.timestamp.startsWith(`${date}T`),
    );
    if (detectGlobalExtremes(dayWeather).length > 0) {
      for (const activity of Object.values(ratings))
        activity.push("UNSUITABLE");
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
      timeZone,
    );
    const ski = scoreSki(dayWeather, date, timeZone);
    const indoor = scoreIndoor(outdoor, ski, surf);

    ratings.outdoorSightseeing.push(outdoor.rating);
    ratings.surfing.push(surf.rating);
    ratings.skiing.push(ski.rating);
    ratings.indoorSightseeing.push(indoor.rating);
  }
  return ratings;
}
