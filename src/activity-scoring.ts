import type {
  MarineObservation,
  SolarDay,
  SourceForecast,
  WeatherObservation,
} from "./open-meteo.js";

export const ACTIVITY_RATINGS = [
  "UNKNOWN",
  "UNSUITABLE",
  "POOR",
  "FAIR",
  "GOOD",
  "EXCELLENT",
] as const;

export type ActivityRating = (typeof ACTIVITY_RATINGS)[number];

type OrdinaryRating = Exclude<ActivityRating, "UNKNOWN">;
type QualityRating = Exclude<OrdinaryRating, "UNSUITABLE">;
type Reason =
  | "WEATHER"
  | "PREREQUISITE_ABSENT"
  | "STRUCTURAL_NON_APPLICABLE"
  | "INSUFFICIENT_DATA"
  | "GLOBAL_EXTREME";

interface Assessment {
  rating: ActivityRating;
  reason: Reason;
}

export interface ActivityRatings {
  skiing: ActivityRating[];
  surfing: ActivityRating[];
  outdoorSightseeing: ActivityRating[];
  indoorSightseeing: ActivityRating[];
}

interface Point<Observation extends string> {
  timestamp: string;
  values: Partial<Record<Observation, number | null>>;
}

interface ScoredHour {
  timestamp: string;
  rating: OrdinaryRating;
  utility: number;
}

interface Opportunity {
  rating: QualityRating;
  score: number;
  duration: number;
  start: string;
}

const qualityRank: Record<OrdinaryRating, number> = {
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

export function scoreActivities(
  weather: SourceForecast<WeatherObservation> | null,
  marine: SourceForecast<MarineObservation> | null,
  dates: readonly string[],
): ActivityRatings {
  const weatherPoints = weather === null ? [] : toPoints(weather);
  const marinePoints = marine === null ? [] : toPoints(marine);
  const solarByDate = new Map(
    (weather?.solarDays ?? []).map((day) => [day.date, day]),
  );
  const structuralMarineNull = isStructurallyNullMarine(marine);

  const skiing: ActivityRating[] = [];
  const surfing: ActivityRating[] = [];
  const outdoorSightseeing: ActivityRating[] = [];
  const indoorSightseeing: ActivityRating[] = [];

  for (const date of dates) {
    const dayWeather = pointsForDate(weatherPoints, date);
    const globalExtreme = hasGlobalExtreme(dayWeather);
    const outdoor = globalExtreme
      ? assessment("UNSUITABLE", "GLOBAL_EXTREME")
      : scoreOutdoor(dayWeather);
    const surf = globalExtreme
      ? assessment("UNSUITABLE", "GLOBAL_EXTREME")
      : scoreSurf(
          dayWeather,
          pointsForDate(marinePoints, date),
          solarByDate.get(date),
          marine,
          structuralMarineNull,
        );
    const ski = globalExtreme
      ? assessment("UNSUITABLE", "GLOBAL_EXTREME")
      : scoreSki(dayWeather);
    const indoor = globalExtreme
      ? assessment("UNSUITABLE", "GLOBAL_EXTREME")
      : scoreIndoor(outdoor, ski, surf);

    outdoorSightseeing.push(outdoor.rating);
    surfing.push(surf.rating);
    skiing.push(ski.rating);
    indoorSightseeing.push(indoor.rating);
  }

  return { skiing, surfing, outdoorSightseeing, indoorSightseeing };
}

function scoreOutdoor(points: Point<WeatherObservation>[]): Assessment {
  const relevant = points.filter((point) => inHourRange(point.timestamp, 8, 18));
  const scorable = new Map(
    relevant
      .filter((point) => hasValues(point, outdoorRequired))
      .map((point) => [point.timestamp, point]),
  );
  const windows: ScoredHour[] = [];

  for (const point of relevant) {
    const window = [0, 1, 2].map((offset) =>
      scorable.get(shiftHours(point.timestamp, offset)),
    );
    if (window.some((entry) => entry === undefined)) continue;
    windows.push(scoreOutdoorWindow(window as Point<WeatherObservation>[]));
  }

  if (windows.length === 0) return assessment("UNKNOWN", "INSUFFICIENT_DATA");
  if (windows.every(({ rating }) => rating === "UNSUITABLE")) {
    return assessment("UNSUITABLE", "WEATHER");
  }

  const best = windows.reduce((left, right) =>
    qualityRank[right.rating] > qualityRank[left.rating] ? right : left,
  );
  const usableHours = [...scorable.values()].filter(
    (point) => scoreOutdoorHour(point) >= 40,
  ).length;

  return assessment(outdoorDaily(best.rating, usableHours), "WEATHER");
}

const outdoorRequired: readonly WeatherObservation[] = [
  "apparentTemperature",
  "precipitation",
  "windSpeed",
  "visibility",
  "weatherCode",
];

function scoreOutdoorWindow(points: Point<WeatherObservation>[]): ScoredHour {
  const temperatures = values(points, "apparentTemperature");
  const precipitation = values(points, "precipitation");
  const wind = values(points, "windSpeed");
  const visibility = values(points, "visibility");
  const weatherCodes = values(points, "weatherCode");
  const thermal = outdoorTemperatureUtility(median(temperatures));
  const precipitationScore = precipitationUtility(precipitation);
  const windScore = outdoorWindUtility(median(wind));
  const visibilityScore = outdoorVisibilityUtility(median(visibility));
  const utility = Math.round(
    thermal * 0.35 + precipitationScore * 0.3 + windScore * 0.2 + visibilityScore * 0.15,
  );

  if (
    weatherCodes.some(isThunderstorm) ||
    visibility.some((value) => value < 200)
  ) {
    return { timestamp: points[0]!.timestamp, rating: "UNSUITABLE", utility: 0 };
  }

  let rating: OrdinaryRating = utilityRating(utility);
  if (thermal === 0 || precipitationScore === 0 || windScore === 0) {
    rating = capRating(rating, "POOR");
  }
  if (visibility.filter((value) => value < 500).length >= 2) {
    rating = capRating(rating, "POOR");
  }
  const gusts = presentValues(points, "windGust");
  if (gusts.some((value) => value >= 80)) rating = capRating(rating, "POOR");
  else if (gusts.some((value) => value >= 70)) rating = capRating(rating, "FAIR");

  return { timestamp: points[0]!.timestamp, rating, utility: cappedUtility(utility, rating) };
}

function scoreOutdoorHour(point: Point<WeatherObservation>): number {
  if (!hasValues(point, outdoorRequired)) return -1;
  const weatherCode = numberValue(point, "weatherCode");
  if (isThunderstorm(weatherCode)) return -1;
  return Math.round(
    outdoorTemperatureUtility(numberValue(point, "apparentTemperature")) * 0.35 +
      precipitationUtility([numberValue(point, "precipitation")]) * 0.3 +
      outdoorWindUtility(numberValue(point, "windSpeed")) * 0.2 +
      outdoorVisibilityUtility(numberValue(point, "visibility")) * 0.15,
  );
}

function outdoorDaily(best: OrdinaryRating, usableHours: number): OrdinaryRating {
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

function scoreSurf(
  weather: Point<WeatherObservation>[],
  marine: Point<MarineObservation>[],
  solar: SolarDay | undefined,
  marineSource: SourceForecast<MarineObservation> | null,
  structuralMarineNull: boolean,
): Assessment {
  if (structuralMarineNull) {
    return assessment("UNSUITABLE", "STRUCTURAL_NON_APPLICABLE");
  }
  if (marineSource === null || solar?.sunrise == null || solar.sunset == null) {
    return assessment("UNKNOWN", "INSUFFICIENT_DATA");
  }

  const start = shiftMinutes(solar.sunrise, -90);
  const end = shiftMinutes(solar.sunset, 60);
  const expected = weather.filter(
    (point) => point.timestamp >= start && point.timestamp <= end,
  );
  if (expected.length === 0) return assessment("UNKNOWN", "INSUFFICIENT_DATA");

  const marineByTime = new Map(marine.map((point) => [point.timestamp, point]));
  const scored = expected.flatMap((weatherPoint) => {
    const marinePoint = marineByTime.get(weatherPoint.timestamp);
    if (
      marinePoint === undefined ||
      !hasValues(weatherPoint, ["windSpeed", "weatherCode"]) ||
      !hasValues(marinePoint, ["waveHeight", "swellPeriod", "wavePeriod"])
    ) {
      return [];
    }
    return [scoreSurfHour(weatherPoint, marinePoint)];
  });

  if (scored.length / expected.length < 0.7) {
    return assessment("UNKNOWN", "INSUFFICIENT_DATA");
  }

  const opportunities = surfOpportunities(scored);
  if (opportunities.length === 0) {
    return assessment(
      scored.every(({ rating }) => rating === "UNSUITABLE") ? "UNSUITABLE" : "POOR",
      "WEATHER",
    );
  }
  opportunities.sort(compareOpportunities);
  return assessment(surfDaily(opportunities), "WEATHER");
}

function scoreSurfHour(
  weather: Point<WeatherObservation>,
  marine: Point<MarineObservation>,
): ScoredHour {
  const waveHeight = numberValue(marine, "waveHeight");
  const swellPeriod = numberValue(marine, "swellPeriod");
  const wavePeriod = numberValue(marine, "wavePeriod");
  const wind = numberValue(weather, "windSpeed");
  const weatherCode = numberValue(weather, "weatherCode");
  let utility = Math.round(
    waveUtility(waveHeight) * 0.45 +
      swellUtility(swellPeriod) * 0.3 +
      surfWindUtility(wind) * 0.25 +
      (wavePeriod / swellPeriod >= 0.85 ? 0 : wavePeriod / swellPeriod >= 0.7 ? -5 : -10),
  );

  if (
    isThunderstorm(weatherCode) ||
    waveHeight >= 4 ||
    (waveHeight >= 3.5 && swellPeriod >= 12) ||
    wind >= 50
  ) {
    return { timestamp: weather.timestamp, rating: "UNSUITABLE", utility: 0 };
  }

  let rating: OrdinaryRating = utilityRating(utility);
  if (waveHeight >= 3 && swellPeriod >= 12) rating = capRating(rating, "POOR");
  utility = cappedUtility(utility, rating);
  return { timestamp: weather.timestamp, rating, utility };
}

function surfOpportunities(hours: ScoredHour[]): Opportunity[] {
  const opportunities: Opportunity[] = [];
  let run: ScoredHour[] = [];
  const flush = () => {
    if (run.length >= 2) {
      let score = -1;
      for (let index = 0; index < run.length - 1; index += 1) {
        score = Math.max(score, Math.round((run[index]!.utility + run[index + 1]!.utility) / 2));
      }
      opportunities.push({
        rating: utilityRating(score),
        score,
        duration: run.length,
        start: run[0]!.timestamp,
      });
    }
    run = [];
  };

  for (const hour of hours) {
    const surfable = qualityRank[hour.rating] >= qualityRank.FAIR;
    if (!surfable || (run.length > 0 && !isNextHour(run.at(-1)!.timestamp, hour.timestamp))) {
      flush();
    }
    if (surfable) run.push(hour);
  }
  flush();
  return opportunities;
}

function compareOpportunities(left: Opportunity, right: Opportunity): number {
  return (
    qualityRank[right.rating] - qualityRank[left.rating] ||
    right.score - left.score ||
    right.duration - left.duration ||
    left.start.localeCompare(right.start)
  );
}

function surfDaily(opportunities: Opportunity[]): QualityRating {
  const best = opportunities[0]!;
  const second = opportunities[1];
  if (second !== undefined) {
    if (best.rating === "EXCELLENT" && second.rating === "EXCELLENT") return "EXCELLENT";
    if (best.rating === "EXCELLENT" && second.rating === "GOOD") return "EXCELLENT";
    if (best.rating === "EXCELLENT" && second.rating === "FAIR") return "GOOD";
    if (best.rating === "GOOD") return "GOOD";
    return "FAIR";
  }
  if (best.rating === "EXCELLENT") return best.duration >= 4 ? "EXCELLENT" : "GOOD";
  if (best.rating === "GOOD") return best.duration >= 3 ? "GOOD" : "FAIR";
  return "FAIR";
}

function scoreSki(points: Point<WeatherObservation>[]): Assessment {
  const expected = points.filter((point) => inHourRange(point.timestamp, 8, 17));
  if (expected.length === 0) return assessment("UNKNOWN", "INSUFFICIENT_DATA");

  const snowDepthValues = presentValues(expected, "snowDepth");
  const enoughSnowEvidence = snowDepthValues.length / expected.length >= 0.7;
  if (enoughSnowEvidence && median(snowDepthValues) < 0.01) {
    return assessment("UNSUITABLE", "PREREQUISITE_ABSENT");
  }

  const scorable = expected.filter((point) => hasValues(point, skiRequired));
  if (scorable.length / expected.length < 0.7 || !enoughSnowEvidence) {
    return assessment("UNKNOWN", "INSUFFICIENT_DATA");
  }

  const snowDepth = median(values(scorable, "snowDepth"));
  const snow = snowDepthUtility(snowDepth);
  const scored = scorable.map((point) => scoreSkiHour(point, snow.utility));
  const usableFraction = scored.filter(isUsable).length / expected.length;
  const blocks = contiguousBlocks(scored.filter(isUsable), 4);
  const blockScores = blocks.map((block) =>
    Math.round(block.reduce((sum, hour) => sum + hour.utility, 0) / block.length),
  );

  let rating: OrdinaryRating;
  if (blockScores.length > 0) {
    const best = utilityRating(Math.max(...blockScores));
    if (best === "EXCELLENT") rating = usableFraction >= 0.75 ? "EXCELLENT" : "GOOD";
    else if (best === "GOOD") rating = usableFraction >= 0.6 ? "GOOD" : "FAIR";
    else rating = "FAIR";
  } else if (scored.some(isUsable) || scored.some(({ rating: value }) => value === "POOR")) {
    rating = "POOR";
  } else {
    rating = "UNSUITABLE";
  }

  rating = capRating(rating, snow.cap);
  const medianTemperature = median(values(scorable, "airTemperature"));
  if (medianTemperature > 10 && snowDepth < 0.1) rating = "UNSUITABLE";
  else if (medianTemperature > 7 && snowDepth < 0.15) rating = capRating(rating, "POOR");
  return assessment(rating, "WEATHER");
}

const skiRequired: readonly WeatherObservation[] = [
  "airTemperature",
  "snowfall",
  "snowDepth",
  "windSpeed",
  "visibility",
  "weatherCode",
  "rain",
];

function scoreSkiHour(point: Point<WeatherObservation>, snowUtility: number): ScoredHour {
  const temperature = numberValue(point, "airTemperature");
  const wind = numberValue(point, "windSpeed");
  const visibility = numberValue(point, "visibility");
  const snowfall = numberValue(point, "snowfall");
  const rain = numberValue(point, "rain");
  const weatherCode = numberValue(point, "weatherCode");
  const cloud = finiteValue(point.values.cloudCover) ? point.values.cloudCover : undefined;
  const temperatureScore = skiTemperatureUtility(temperature);
  const windScore = skiWindUtility(wind);
  const weatherScore = Math.min(snowfallUtility(snowfall), skiVisibilityUtility(visibility));
  const weighted =
    snowUtility * 0.35 + weatherScore * 0.25 + windScore * 0.2 + temperatureScore * 0.15;
  let utility = Math.round(
    cloud === undefined ? weighted / 0.95 : weighted + cloudUtility(cloud) * 0.05,
  );

  if (wind >= 50 || visibility < 500 || rain > 2) {
    return { timestamp: point.timestamp, rating: "UNSUITABLE", utility: 0 };
  }

  let rating: OrdinaryRating = utilityRating(utility);
  if (temperatureScore === 0) rating = capRating(rating, "POOR");
  if (rain > 0.5 || weatherCode === 66) rating = capRating(rating, "POOR");
  else if (rain > 0) rating = capRating(rating, "FAIR");
  utility = cappedUtility(utility, rating);
  return { timestamp: point.timestamp, rating, utility };
}

function scoreIndoor(outdoor: Assessment, ski: Assessment, surf: Assessment): Assessment {
  if (outdoor.rating === "UNKNOWN") return assessment("UNKNOWN", "INSUFFICIENT_DATA");
  if (
    qualityRank[outdoor.rating as OrdinaryRating] < qualityRank.GOOD &&
    outdoor.reason === "WEATHER" &&
    [ski, surf].every(
      (candidate) =>
        (candidate.reason === "WEATHER" &&
          candidate.rating !== "UNKNOWN" &&
          qualityRank[candidate.rating] < qualityRank.GOOD) ||
        candidate.reason === "PREREQUISITE_ABSENT" ||
        candidate.reason === "STRUCTURAL_NON_APPLICABLE",
    ) &&
    [ski, surf].every((candidate) => candidate.rating !== "UNKNOWN")
  ) {
    return assessment("EXCELLENT", "WEATHER");
  }
  return assessment("GOOD", "WEATHER");
}

function hasGlobalExtreme(points: Point<WeatherObservation>[]): boolean {
  const relevant = points.filter((point) => inHourRange(point.timestamp, 6, 22));
  if (
    relevant.some(
      (point) =>
        valueAtLeast(point, "windGust", 93) ||
        valueEquals(point, "weatherCode", 67) ||
        valueEquals(point, "weatherCode", 99),
    )
  ) {
    return true;
  }
  return (
    hasConsecutive(relevant, 2, (point) => valueAtLeast(point, "apparentTemperature", 45)) ||
    hasConsecutive(relevant, 2, (point) => valueAtMost(point, "apparentTemperature", -30)) ||
    hasConsecutive(
      relevant,
      3,
      (point) =>
        valueAbove(point, "snowfall", 0) &&
        valueAtMost(point, "visibility", 400) &&
        valueAtLeast(point, "windGust", 56),
    )
  );
}

function hasConsecutive<Observation extends string>(
  points: Point<Observation>[],
  count: number,
  predicate: (point: Point<Observation>) => boolean,
): boolean {
  let run = 0;
  let previous: Point<Observation> | undefined;
  for (const point of points) {
    run = predicate(point) && (previous === undefined || isNextHour(previous.timestamp, point.timestamp))
      ? run + 1
      : predicate(point) ? 1 : 0;
    if (run >= count) return true;
    previous = point;
  }
  return false;
}

function isStructurallyNullMarine(
  source: SourceForecast<MarineObservation> | null,
): boolean {
  if (source === null) return false;
  const required: MarineObservation[] = ["waveHeight", "swellPeriod", "wavePeriod"];
  return required.every((key) => {
    const observations = source.observations[key];
    return observations !== undefined && observations.length > 0 && observations.every((value) => value === null);
  });
}

function toPoints<Observation extends string>(
  source: SourceForecast<Observation>,
): Point<Observation>[] {
  return source.localTimestamps.map((timestamp, index) => ({
    timestamp,
    values: Object.fromEntries(
      Object.entries(source.observations).map(([key, observations]) => [
        key,
        (observations as readonly (number | null)[])[index],
      ]),
    ) as Partial<Record<Observation, number | null>>,
  }));
}

function pointsForDate<Observation extends string>(
  points: Point<Observation>[],
  date: string,
): Point<Observation>[] {
  return points.filter((point) => point.timestamp.startsWith(`${date}T`));
}

function hasValues<Observation extends string>(
  point: Point<Observation>,
  fields: readonly Observation[],
): boolean {
  return fields.every((field) => finiteValue(point.values[field]));
}

function values<Observation extends string>(
  points: Point<Observation>[],
  field: Observation,
): number[] {
  return points.map((point) => numberValue(point, field));
}

function presentValues<Observation extends string>(
  points: Point<Observation>[],
  field: Observation,
): number[] {
  return points.flatMap((point) => {
    const value = point.values[field];
    return finiteValue(value) ? [value] : [];
  });
}

function numberValue<Observation extends string>(
  point: Point<Observation>,
  field: Observation,
): number {
  return point.values[field] as number;
}

function finiteValue(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function valueAtLeast<Observation extends string>(point: Point<Observation>, field: Observation, threshold: number): boolean {
  const value = point.values[field];
  return finiteValue(value) && value >= threshold;
}

function valueAbove<Observation extends string>(point: Point<Observation>, field: Observation, threshold: number): boolean {
  const value = point.values[field];
  return finiteValue(value) && value > threshold;
}

function valueAtMost<Observation extends string>(point: Point<Observation>, field: Observation, threshold: number): boolean {
  const value = point.values[field];
  return finiteValue(value) && value <= threshold;
}

function valueEquals<Observation extends string>(point: Point<Observation>, field: Observation, expected: number): boolean {
  return point.values[field] === expected;
}

function assessment(rating: ActivityRating, reason: Reason): Assessment {
  return { rating, reason };
}

function utilityRating(utility: number): QualityRating {
  if (utility >= 80) return "EXCELLENT";
  if (utility >= 60) return "GOOD";
  if (utility >= 40) return "FAIR";
  return "POOR";
}

function capRating<T extends OrdinaryRating>(rating: T, cap: QualityRating): T | QualityRating {
  return qualityRank[rating] > qualityRank[cap] ? cap : rating;
}

function cappedUtility(utility: number, rating: OrdinaryRating): number {
  return rating === "UNSUITABLE" ? 0 : Math.min(utility, capUtility[rating]);
}

function median(input: number[]): number {
  const sorted = [...input].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
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

function outdoorWindUtility(value: number): number {
  return descendingUtility(value, [20, 30, 40, 50]);
}

function outdoorVisibilityUtility(value: number): number {
  if (value >= 10_000) return 100;
  if (value >= 5_000) return 75;
  if (value >= 2_000) return 50;
  if (value >= 500) return 25;
  return 0;
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
  return ascendingUtility(value, [5, 7, 9, 12]);
}

function surfWindUtility(value: number): number {
  return descendingUtility(value, [10, 20, 30, 40]);
}

function snowDepthUtility(value: number): { utility: number; cap: QualityRating } {
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

function skiWindUtility(value: number): number {
  return descendingUtility(value, [12, 20, 30, 40]);
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

function descendingUtility(value: number, thresholds: [number, number, number, number]): number {
  if (value < thresholds[0]) return 100;
  if (value < thresholds[1]) return 75;
  if (value < thresholds[2]) return 50;
  if (value < thresholds[3]) return 25;
  return 0;
}

function ascendingUtility(value: number, thresholds: [number, number, number, number]): number {
  if (value < thresholds[0]) return 0;
  if (value < thresholds[1]) return 25;
  if (value < thresholds[2]) return 50;
  if (value < thresholds[3]) return 75;
  return 100;
}

function isThunderstorm(code: number): boolean {
  return code === 95 || code === 96 || code === 99;
}

function isUsable(hour: ScoredHour): boolean {
  return qualityRank[hour.rating] >= qualityRank.FAIR;
}

function contiguousBlocks(hours: ScoredHour[], size: number): ScoredHour[][] {
  const blocks: ScoredHour[][] = [];
  for (let index = 0; index <= hours.length - size; index += 1) {
    const block = hours.slice(index, index + size);
    if (block.slice(1).every((hour, offset) => isNextHour(block[offset]!.timestamp, hour.timestamp))) {
      blocks.push(block);
    }
  }
  return blocks;
}

function inHourRange(timestamp: string, start: number, end: number): boolean {
  const hour = Number(timestamp.slice(11, 13));
  return hour >= start && hour <= end;
}

function isNextHour(left: string, right: string): boolean {
  return shiftHours(left, 1) === right;
}

function shiftHours(timestamp: string, amount: number): string {
  return shiftMinutes(timestamp, amount * 60);
}

function shiftMinutes(timestamp: string, amount: number): string {
  const value = new Date(`${timestamp}:00Z`);
  value.setUTCMinutes(value.getUTCMinutes() + amount);
  return value.toISOString().slice(0, 16);
}
