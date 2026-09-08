# Spike 002 — Public advisory addendum

Status: HUMAN ACCEPTED
Scope: post-evaluator consolidation
Depends on: `brief.md`, `calibration.md`

## Purpose

Activity ratings remain deliberately coarse and do not expose detailed reasons
for ordinary scoring outcomes.

The service additionally preserves sparse public advisories where a categorical
rating alone would omit materially important interpretation context.

Advisories are not a general explanation mechanism and must not expose the
internal scoring formula.

This addendum does not change any accepted rating thresholds, scoring weights,
coverage rules or activity-calibration outcomes.

## Advisory scopes

### Daily advisories

Daily advisories describe a condition established for one target date.

The global extreme-weather override must preserve the specific trigger or
triggers that caused it:

- `EXTREME_WIND`
- `BLIZZARD_LIKE_CONDITIONS`
- `HEAVY_FREEZING_RAIN`
- `EXTREME_HEAT`
- `EXTREME_COLD`
- `HEAVY_HAIL_THUNDERSTORM`

More than one extreme-weather advisory may apply to the same date.

The following activity-specific daily advisories are also exposed:

- `SKIING_NO_SNOW`
- `LARGE_SURF`
- `NO_SURF`

`SKIING_NO_SNOW` is emitted only when the existing independently sufficient
no-snow prerequisite makes skiing `UNSUITABLE`.

`LARGE_SURF` is emitted only when the existing large/powerful-surf veto makes
surfing `UNSUITABLE`.

`LARGE_SURF` means that the conditions are outside the supported recommendation
range for the generic recreational-surfer model. It is not a claim that no
expert surfer could surf the conditions and is not a break-specific safety
assessment.

`NO_SURF` is a date-scoped surfing advisory. It is emitted only when ordinary
surf evidence meets the normal period-sufficiency requirement and the observed
marine forecast affirmatively establishes that wave height remains below the
model's minimum meaningful surf range throughout the sufficiently observed
access period.

For the current calibration, this means all sufficiently observed surf-access
wave-height values are `<0.30 m`.

`NO_SURF` must not be inferred from sparse evidence, missing marine data, poor
wind, poor wave period, thunderstorms, or merely from failure to find a valid
two-hour opportunity.

It describes the generic recreational-surfer model and is not a break-specific
claim that literally no rideable wave can exist.
Ordinary `POOR`, `FAIR`, `GOOD` and `EXCELLENT` outcomes do not receive public
reason codes.

Sparse or insufficient evidence does not receive a public advisory merely
because the activity result is `UNKNOWN`.

### Forecast/location advisories

`SURFING_NOT_APPLICABLE` is forecast-scoped.

It is emitted when the existing successful full-horizon structural marine-null
rule establishes that surfing is not applicable at the resolved location.

It must not be duplicated as seven daily advisories.

No separate forecast-level `SKIING_NO_SNOW_FORECAST` advisory is required in
this increment. The underlying no-snow conclusion remains date-specific and can
be derived across dates by a caller if required.

## Internal classification

Public advisories do not replace internal assessment classifications.

The scorer may continue to distinguish concepts such as:

- ordinary weather-driven result;
- prerequisite absence;
- structural non-applicability;
- insufficient evidence;
- global extreme weather.

These classifications are implementation/domain semantics used by logic such
as indoor sightseeing.

The implementation must preserve enough information to produce public
advisories without making the public advisory enum the internal control-flow
model.

## GraphQL shape

Extend the assessment response with:

```graphql
type DailyAdvisory {
  date: String!
  codes: [DailyAdvisoryCode!]!
}

enum DailyAdvisoryCode {
  EXTREME_WIND
  BLIZZARD_LIKE_CONDITIONS
  HEAVY_FREEZING_RAIN
  EXTREME_HEAT
  EXTREME_COLD
  HEAVY_HAIL_THUNDERSTORM
  SKIING_NO_SNOW
  LARGE_SURF
  NO_SURF
}

enum ForecastAdvisoryCode {
  SURFING_NOT_APPLICABLE
}
```
