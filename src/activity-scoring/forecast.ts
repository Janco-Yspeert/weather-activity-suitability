import type {
  MarineObservation,
  SourceForecast,
  WeatherObservation,
} from "../open-meteo.js";
import type { MarineEvidence, MarineHour, WeatherHour } from "./types.js";

export function weatherHours(
  source: SourceForecast<WeatherObservation> | null,
): WeatherHour[] {
  return (
    source?.localTimestamps.map((timestamp, index) => ({
      timestamp,
      airTemperature: finiteObservation(
        source.observations.airTemperature?.[index],
      ),
      apparentTemperature: finiteObservation(
        source.observations.apparentTemperature?.[index],
      ),
      precipitation: finiteObservation(
        source.observations.precipitation?.[index],
      ),
      rain: finiteObservation(source.observations.rain?.[index]),
      snowfall: finiteObservation(source.observations.snowfall?.[index]),
      snowDepth: finiteObservation(source.observations.snowDepth?.[index]),
      windSpeed: finiteObservation(source.observations.windSpeed?.[index]),
      windGust: finiteObservation(source.observations.windGust?.[index]),
      visibility: finiteObservation(source.observations.visibility?.[index]),
      weatherCode: finiteObservation(source.observations.weatherCode?.[index]),
      cloudCover: finiteObservation(source.observations.cloudCover?.[index]),
    })) ?? []
  );
}

export function marineHours(
  source: SourceForecast<MarineObservation> | null,
): MarineHour[] {
  return (
    source?.localTimestamps.map((timestamp, index) => ({
      timestamp,
      waveHeight: finiteObservation(source.observations.waveHeight?.[index]),
      swellPeriod: finiteObservation(source.observations.swellPeriod?.[index]),
      wavePeriod: finiteObservation(source.observations.wavePeriod?.[index]),
    })) ?? []
  );
}

// Structural absence requires explicit nulls in every required series across
// the retained horizon. Missing series and request failure are not that evidence.
export function assessMarineEvidence(
  source: SourceForecast<MarineObservation> | null,
): MarineEvidence {
  if (source === null) return "UNAVAILABLE";
  const required: MarineObservation[] = [
    "waveHeight",
    "swellPeriod",
    "wavePeriod",
  ];
  const structurallyNull = required.every((key) => {
    const series = source.observations[key];
    return (
      series !== undefined &&
      series.length > 0 &&
      series.every((value) => value === null)
    );
  });
  return structurallyNull ? "STRUCTURAL_NON_APPLICABLE" : "AVAILABLE";
}

function finiteObservation(
  value: number | null | undefined,
): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}
