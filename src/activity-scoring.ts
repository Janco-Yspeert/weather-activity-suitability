// Preserve the established scoring import path and public exports.
export {
  ACTIVITY_RATINGS,
  DAILY_ADVISORY_CODES,
  FORECAST_ADVISORY_CODES,
  scoreActivities,
} from "./activity-scoring/index.js";
export type {
  ActivityRating,
  ActivityRatings,
  DailyAdvisory,
  DailyAdvisoryCode,
  ForecastAdvisoryCode,
} from "./activity-scoring/types.js";
