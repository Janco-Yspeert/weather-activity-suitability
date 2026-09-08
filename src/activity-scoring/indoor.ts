import type { Assessment } from "./types.js";
import { assessment, qualityRank } from "./utility.js";

export function scoreIndoor(
  outdoor: Assessment,
  ski: Assessment,
  surf: Assessment,
): Assessment {
  if (outdoor.rating === "UNKNOWN")
    return assessment("UNKNOWN", "INSUFFICIENT_DATA");
  if (
    qualityRank[outdoor.rating] < qualityRank.GOOD &&
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
