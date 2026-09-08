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

Except for the explicit sufficiently-evidenced NO_SURF absence rule below,
this addendum does not change existing rating thresholds, scoring weights,
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

When surf period evidence meets the ordinary >=70% sufficiency requirement and
every scorable access-period wave-height observation is <0.30m, surfing is
UNSUITABLE and emits NO_SURF.
This absence conclusion cannot be made under partial period coverage.

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

### Skiing no-snow advisories

`SKIING_NO_SNOW` is a date-scoped advisory. It is established only when the
existing independently sufficient no-snow prerequisite makes skiing
`UNSUITABLE` for that target date.

`SKIING_NO_SNOW_FORECAST` is forecast-scoped. It is emitted when that same
no-snow prerequisite is independently established for every target date in the
returned forecast.

When `SKIING_NO_SNOW_FORECAST` is emitted, the equivalent daily
`SKIING_NO_SNOW` advisories are suppressed to avoid redundant repetition.

If the no-snow prerequisite applies to only some target dates, no forecast-level
advisory is emitted and the applicable dates retain their individual
`SKIING_NO_SNOW` advisories.

`UNKNOWN` skiing dates do not count as evidence of no snow and therefore cannot
contribute to `SKIING_NO_SNOW_FORECAST`.

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
  SKIING_NO_SNOW_FORECAST
}
```

### Advisory response semantics

`ForecastAssessment` exposes advisories separately from activity ratings:

```graphql
type ForecastAssessment {
  metadata: ForecastMetadata!
  location: ResolvedLocation!
  dates: [String!]!

  skiing: [ActivityRating!]!
  surfing: [ActivityRating!]!
  outdoorSightseeing: [ActivityRating!]!
  indoorSightseeing: [ActivityRating!]!

  dailyAdvisories: [DailyAdvisory!]!
  forecastAdvisories: [ForecastAdvisoryCode!]!
}

dailyAdvisories is sparse and date-keyed rather than positionally aligned
with dates.

A target date with no advisory does not need an entry. Callers must therefore
use DailyAdvisory.date rather than assuming that dailyAdvisories[n]
corresponds to dates[n].

A single date may contain multiple advisory codes. This is particularly
important for global extreme weather, where more than one independently
established condition may apply.

forecastAdvisories contains conclusions whose evidence and meaning apply to
the forecast/location as a whole rather than to one target date. In v1 this is
used for SURFING_NOT_APPLICABLE.

Both fields are non-null lists and return an empty array when no corresponding
advisories exist.

Advisories supplement activity ratings; they do not replace them and they are
not intended to explain every rating.

Examples:

- skiing: UNSUITABLE with daily SKIING_NO_SNOW identifies an affirmatively
established prerequisite failure.
- surfing: UNSUITABLE with daily NO_SURF identifies a sufficiently evidenced
flat-surf condition.
- LARGE_SURF preserves important context where the recreational-surfer
recommendation envelope has been exceeded.
- all four activities may be UNSUITABLE while one or more daily extreme-
weather advisories preserve the specific global-override trigger.
- SURFING_NOT_APPLICABLE appears once at forecast scope rather than being
duplicated for every date.

The GraphQL contract exposes stable advisory codes rather than free-text
explanations. Human-readable presentation of those codes is a client concern.
```
