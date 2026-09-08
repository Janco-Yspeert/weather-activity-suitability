# As-Built — Spike 002 — Activity Methodology and Scoring

Status: ALIGNED

## Implemented shape

Spike 002 replaces the inherited seven-date `UNKNOWN` placeholders with a
provider-independent scoring pipeline. `ForecastService` still resolves the
canonical location, derives the seven complete destination-local target dates,
and acquires weather and marine sources independently. It now requests the full
v1 observation set: eleven weather series, three marine series, and date-keyed
sunrise/sunset values from the weather provider.

The Open-Meteo boundary validates aligned hourly arrays and solar dates, maps
provider fields to application-owned observation names, and retains the whole
validated marine horizon. Before scoring, non-finite or absent observations
become missing canonical values without being zero-filled. Source availability
continues to use Spike 001's weak target-date coverage rule and remains separate
from activity-specific evidence sufficiency.

Scoring is orchestrated once per target date. A global extreme-weather pass has
precedence; otherwise outdoor sightseeing, surfing, and skiing are assessed
independently and their reasoned internal assessments feed indoor sightseeing.
Only categorical ratings and sparse public advisories cross the GraphQL
boundary. Internal numeric utility, reason categories, and surf details remain
implementation-owned.

## Observable behavior and structural facts

- Global extremes inspect weather from `06:00` through `22:00` local wall-clock
  time. Extreme gust, blizzard-like evidence, freezing rain, sustained extreme
  heat/cold, and heavy hail/thunderstorm make all four activities
  `UNSUITABLE`. Every independently established trigger is retained as a daily
  advisory.
- Outdoor sightseeing considers `08:00` through `18:00`, requires a complete
  aligned three-hour window, and combines apparent temperature,
  precipitation, sustained wind, visibility, weather-code vetoes, and optional
  gust caps. Daily quality combines the best window with the independently
  counted usable hours. Without one complete window it is `UNKNOWN`.
- Surfing constructs expected hourly slots from sunrise minus 90 minutes
  through sunset plus 60 minutes. Weather and all three marine signals must be
  present at the same expected timestamp. At 70% period coverage it uses the
  calibrated whole-period opportunity aggregation; below 70%, only a complete
  observed two-hour-or-longer opportunity can produce a positive result, capped
  at `GOOD`. Sparse adverse evidence remains `UNKNOWN`.
- A successfully validated marine horizon with all values null in every
  required marine series makes surfing structurally `UNSUITABLE` for every
  target date and emits one forecast-scoped `SURFING_NOT_APPLICABLE` advisory.
  Provider failure, a partially null horizon, or target-date-only nulls do not
  establish that conclusion.
- Sufficiently covered surf periods whose scorable wave heights are all below
  `0.30 m` are `UNSUITABLE` with `NO_SURF`; individual flat-water hours are
  capped at `POOR`. Large or powerful surf produces `LARGE_SURF` only when the
  calibrated recreational-range veto determines the daily result.
- Skiing constructs ten expected slots from `08:00` through `17:00`. Ordinary
  scoring requires 70% complete ski evidence and 70% snow-depth evidence, then
  applies the calibrated snow, weather, wind, temperature, cloud, rain,
  sustained-block, usable-fraction, and warm/marginal-snow rules. Below 70%
  ordinary coverage, only one fully observed four-hour usable block can support
  a positive fallback, capped by its block-local snow evidence and at `GOOD`.
- Snow-depth evidence covering at least 70% of the ski period can independently
  establish the no-snow prerequisite and make skiing `UNSUITABLE`. This emits a
  date-scoped `SKIING_NO_SNOW`, except when every returned target date
  establishes the condition; then the daily codes are suppressed and one
  `SKIING_NO_SNOW_FORECAST` advisory is emitted.
- Indoor sightseeing is `UNKNOWN` when ordinary outdoor evidence is
  insufficient, `UNSUITABLE` under a global veto, and otherwise `GOOD` or
  `EXCELLENT`. It becomes `EXCELLENT` only when sufficiently evidenced weather
  removes the outdoor alternatives; ski prerequisite absence and structural
  surf non-applicability do not masquerade as bad weather.
- GraphQL returns four chronological, date-aligned rating arrays plus sparse
  date-keyed daily advisories and forecast-scoped advisories. Advisory lists are
  non-null and empty when no affirmative advisory applies.

## Inherited and changed behavior

Canonical location identity, seven complete destination-local future dates,
runtime provider validation, independent weather/marine outcomes, four-state
source metadata, and canonical-location in-process refresh coalescing are
inherited unchanged from Spike 001. Expected provider failures degrade only the
affected source; unexpected errors still propagate, and settlement releases the
coalescing entry so later requests refresh again.

The material change is real per-activity scoring over timestamp-aligned
application observations, including activity-specific sufficiency and explicit
global/activity caps, vetoes, prerequisites, and reason semantics. The later
human-accepted advisory addendum adds sparse public context and the
sufficiently-evidenced flat-surf conclusion without exposing the internal
formula.

The later human-accepted DST simplification is also present: expected activity
slots are generated as ordinary destination-local wall-clock timestamps.
Duplicate fall-back timestamps have one alignment identity, a skipped or
missing timestamp remains missing evidence, and v1 does not reconstruct
separate real-instant identities through a clock transition. This preserves the
independent expected-period denominator and does not reject a source date merely
for containing 23 or 25 records, but a transition intersecting an activity
period can reduce that activity's evidence.

## Assumptions, limitations, and deliberate omissions

The scores are coarse weather-suitability heuristics, not safety guarantees or
claims that a ski area, surf break, or indoor venue exists. Surfing is a generic
recreational-user, location-level proxy without tide, current, direction, or
break-specific data. Skiing has no elevation, resort, lift, or snowpack model.
Cloud cover is an optional weak ski modifier.

Persistence, request-time snapshot reuse, stale fallback execution, transport
retry/timeout policy, HTTP delivery, distributed coordination, and a generic
multi-provider framework remain absent for later spikes. The adapter's
`195`-hour hourly request and explicit eight-day solar request are provider
strategies, not application scoring invariants.

## Contract comparison

No Missing, Contradictory, or Extra material findings. The current candidate
matches the Spike 002 brief, accepted calibration and advisory addendum, Design
Map integration boundaries, and the later accepted DST scope refinement.
