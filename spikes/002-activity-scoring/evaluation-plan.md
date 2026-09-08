# Evaluation Plan — Spike 002 — Activity Methodology and Scoring

Status: PREPARED

## Scope and evidence boundary

This plan evaluates the accepted Spike 002 contract: `brief.md`, the accepted
`calibration.md`, and the READY Design Map. The calibration is the executable
source for thresholds, sufficiency, caps, vetoes, aggregation and its stated
scenarios. Spike 001's public contracts for location identity, seven
destination-local dates, independent sources, source metadata, provider
validation, GraphQL alignment and refresh coalescing remain inherited.

No Spike 002 candidate implementation or developer tests were read or run when
preparing this plan. No evaluator-authored executable checks are declared:
although the inherited `ForecastService` provider/clock construction seam is a
fair controlled-input seam, a prewritten suite would largely duplicate the
accepted calibration tables and risk coupling to an unfinished forecast shape.
The procedures below use that public service boundary (or its GraphQL result)
with deterministic provider responses at verification time. They do not require
particular scorer functions, modules, DTO types or data structures.

All controlled observations below use destination-local hourly timestamps. A
procedure that refers to an otherwise complete day supplies the expected local
activity slots and finite required values unless it deliberately tests missing
evidence. Each expected result is asserted in the GraphQL activity arrays and
against their corresponding target date; internal reason categories are
inspected only where needed to establish the indoor rule's observable outcome.

## Required verification environment

- `npm run typecheck`
- `npm test`
- The inherited deterministic provider/clock seam, exercised directly and via
  the GraphQL schema where the response contract is in question.
- No live Open-Meteo call is required. The opt-in integration suite may be run
  as supplemental boundary evidence but cannot decide a scoring finding.

## Planned criteria

### EVAL-01 — Application-owned observation boundary and retained alignment

- **Evidence mode:** inspection plus deterministic controlled-input check.
- **Procedure:** Inspect the provider contract/request mapping and feed a
  location with aligned hourly weather, marine and date-keyed solar values.
  Confirm the final v1 weather set represents air/apparent temperature,
  precipitation, rain, snowfall, snow depth, sustained wind, gust, visibility,
  weather code, cloud cover, sunrise and sunset; confirm the marine set
  represents wave height, swell period and combined wave period. Verify the
  scorer sees application-owned names and aligned local timestamps, not raw
  Open-Meteo field names or independently reduced daily extrema. Check that
  sunrise/sunset are acquired by the weather boundary rather than another
  provider.
- **Expected result:** required observations cross the validated provider
  boundary in an application-owned canonical representation; surf combinations
  can only be formed from same-timestamp weather and marine values.
- **Negative/boundary probes:** put individually excellent wave, period and
  wind values at different hours; the result must not become a synthetic
  excellent session. Supply a 23-hour and a 25-hour local date with complete
  applicable activity periods; neither is rejected merely by record count.
- **Why sufficient:** this challenges the observable information boundary and
  timestamp invariant without prescribing its TypeScript representation.

### EVAL-02 — Global override has narrow local-time scope and precedence

- **Evidence mode:** automated deterministic procedure through the service.
- **Procedure:** For otherwise scorable activity periods, test each accepted
  trigger within 06:00–22:00: gust >=93 km/h; three consecutive blizzard-like
  hours; code 67; two consecutive apparent-temperature hours >=45 C; two <=-30
  C; and code 99. Repeat with extreme heat confined to 03:00.
- **Expected result:** every positive in-period trigger makes all four arrays
  `UNSUITABLE` for that date, including indoor sightseeing. The 03:00-only
  heat does not itself create a global veto. Missing hazard fields do not
  manufacture a veto.
- **Negative/boundary probes:** test immediately below each numerical trigger,
  two non-consecutive blizzard hours, and one extreme-temperature hour.
- **Why sufficient:** proves both global precedence and that night data is not
  accidentally treated as a blanket day veto, while leaving detection code
  unconstrained.

### EVAL-03 — Evidence semantics and inherited source metadata remain honest

- **Evidence mode:** automated deterministic procedure plus GraphQL check.
- **Procedure:** Produce independently successful, partial, all-null and
  failed weather/marine responses. Then omit required activity fields or slots
  while leaving the weak source coverage rule satisfied.
- **Expected result:** source metadata remains `AVAILABLE`, `PARTIAL`,
  `NO_DATA`, or `UNAVAILABLE` by the inherited definition, distinct from
  activity sufficiency. Unsupported activity conclusions are `UNKNOWN`, never
  favourable-by-default or `UNSUITABLE` merely from failure/missing evidence.
  GraphQL retains seven chronological dates and four date-aligned categorical
  arrays with real scoring results rather than unconditional placeholders.
- **Negative/boundary probes:** a successful full-horizon all-null marine
  response may establish only the documented structural surf conclusion;
  marine request/validation failure must remain `UNKNOWN`. Verify normal
  weather-dependent activities still receive supported results when marine
  fails.
- **Why sufficient:** validates the public degradation contract and the central
  UNKNOWN-versus-UNSUITABLE distinction without relying on internal state.

### EVAL-04 — Outdoor windows, score shape, caps and daily aggregation

- **Evidence mode:** automated deterministic procedure.
- **Procedure:** Exercise the accepted outdoor scenarios using 08:00–18:00
  local hourly values: dry 22 C / light-wind / 10 km visibility window;
  one brief shower; three 0.4 mm drizzle hours; >6 mm over three hours;
  light snow with good visibility; a code-95 window; and a candidate containing
  <200 m visibility. Verify 3-hour contiguity, component bands/weights,
  rounding, vetoes/caps and the best-window-plus-usable-hours daily matrix.
- **Expected result:** the stated calibration outcomes hold: comfortable dry
  window is `EXCELLENT`; one shower is not unsuitable; persistent drizzle
  cannot receive the GOOD precipitation component; sustained heavy rain caps
  at `POOR`; light snow is not intrinsically poor; thunderstorm and <200 m
  window rules are unsuitable. One isolated excellent hour cannot yield an
  excellent day, whereas a strong contiguous period may survive poor later
  hours according to the daily matrix.
- **Negative/boundary probes:** test exact bands, gust caps at 70/80 km/h,
  2-hour <500 m cap, no complete 3-hour window (`UNKNOWN`), and missing required
  ordinary fields (not zero-filled).
- **Why sufficient:** falsifies temporal synthesis, non-compensation and the
  explicit calibration, rather than asserting a particular window algorithm.

### EVAL-05 — Surf sessions use aligned daylight evidence and discrete opportunities

- **Evidence mode:** automated deterministic procedure.
- **Procedure:** With supplied local sunrise/sunset, construct surf access slots
  and execute calibration scenarios: 1.2 m/12 s/11 s/8 km/h; same with 6 s
  swell; a 14 s/8 s mixed-period case; 35 km/h wind; >=4 m waves; overlapping
  good 2-hour slices in one run; separated morning/evening runs; one 2-hour
  excellent run; and one >=4-hour excellent run. Verify 70% same-timestamp
  coverage before ordinary aggregation.
- **Expected result:** period/wind/chop changes produce the documented relative
  outcomes; mixed sea is penalised but not vetoed solely by its ratio; large
  waves receive the explicit veto; overlapping slices are one maximal
  opportunity; distinct runs are two; a single 2-hour excellent opportunity
  is daily `GOOD`, and a >=4-hour excellent opportunity is daily `EXCELLENT`.
  Night-only excellent conditions outside the solar access period cannot make
  an excellent day.
- **Negative/boundary probes:** below 70% scorable slots is `UNKNOWN`; a
  missing solar endpoint is `UNKNOWN`; a `POOR`, unsuitable, missing or
  unscorable slot splits an opportunity; exact chop, wave, wind and period
  thresholds follow the calibration table.
- **Why sufficient:** checks the public session semantics and aggregation with
  simultaneous source data, without requiring a particular opportunity class.

### EVAL-06 — Surf non-applicability requires complete structural evidence

- **Evidence mode:** automated deterministic procedure.
- **Procedure:** Supply a successfully validated marine horizon whose required
  three series are all null for every fetched timestamp, then repeat with one
  null target date but usable values elsewhere in the horizon, and with a
  failed marine boundary.
- **Expected result:** only the all-null successfully validated full horizon
  makes surfing `UNSUITABLE` for every target date. A single null target date
  does not infer structural non-applicability and follows ordinary sufficiency
  (`UNKNOWN` when insufficient). A failed boundary is `UNKNOWN`.
- **Negative/boundary probes:** retain values outside the seven target dates to
  ensure the implementation neither truncates the horizon before the rule nor
  mistakes a target-date gap for structural absence.
- **Why sufficient:** independently distinguishes affirmative structural
  evidence from failed/incomplete evidence, the easy place for semantics to
  rot into nonsense.

### EVAL-07 — Skiing treats snow as a sufficient prerequisite and needs sustained opportunity

- **Evidence mode:** automated deterministic procedure.
- **Procedure:** Use 08:00–17:00 local periods to test the accepted ski
  scenarios: >=0.30 m median snow near 0 C/light wind/good visibility; <0.01 m
  snow with >=70% snow-depth coverage; snow depth below coverage threshold;
  0.05–<0.15 m snow; only two excellent hours; four contiguous strong hours;
  3+3 good hours split by poor conditions; rain >2 mm/h; 35–45 km/h sustained
  wind; and >7 C median with <0.15 m snow. Check weather fields are all
  required, except optional cloud-weight renormalisation.
- **Expected result:** substantial snow can support `EXCELLENT`; credible
  no-snow is `UNSUITABLE`; insufficient snow evidence is `UNKNOWN`; marginal
  snow cannot exceed `FAIR`; isolated excellent hours cannot produce
  GOOD/EXCELLENT; a sustained block can; split runs are worse than an
  equivalent continuous run; rain vetoes its hour; strong wind materially
  degrades; warm marginal snow caps the day at `POOR`.
- **Negative/boundary probes:** check 70% coverage and exact snow/rain/wind/
  visibility bands, no-usable but scorable-POOR fallback, all-scorable-
  unsuitable fallback, and a missing-required-evidence case that must not be
  relabelled `POOR`. Confirm no elevation/resort availability gate exists.
- **Why sufficient:** challenges both snow prerequisite semantics and temporal
  aggregation without inspecting a private score representation.

### EVAL-08 — Indoor assessment honours reasoned opportunity cost

- **Evidence mode:** automated deterministic procedure, with targeted
  inspection only if the observable outcome cannot distinguish reason classes.
- **Procedure:** Establish an ordinary-weather-sufficient day for each accepted
  indoor scenario: outdoor `EXCELLENT` with ski/surf non-applicable; outdoor
  `FAIR` for weather plus weather-`POOR` surf and prerequisite/structural ski;
  surf `UNKNOWN` from provider failure; insufficient ordinary weather; and a
  global override.
- **Expected result:** indoor is respectively `GOOD`, `EXCELLENT`, `GOOD`,
  `UNKNOWN`, and `UNSUITABLE`. It never emits `FAIR`/`POOR` in v1. Structural
  marine absence and absent ski prerequisite are ignored rather than counted
  as weather removing alternatives; unknown evidence cannot boost indoor.
- **Negative/boundary probes:** an outdoor `UNKNOWN` blocks the boost; an
  activity rated below GOOD for reason `WEATHER` may participate; a global veto
  wins regardless of all other assessments.
- **Why sufficient:** validates the externally material dependency behaviour
  while allowing any internal reason-category implementation that preserves it.

### EVAL-09 — Inherited lifecycle and scope are preserved

- **Evidence mode:** existing visible checks plus inspection.
- **Procedure:** Run the inherited deterministic tests and inspect changed
  dependencies/configuration. Verify canonical-location refresh coalescing,
  independently observable source acquisition and the location/date contract
  still pass. Inspect that no database/ORM, durable schema, request-time
  snapshot reuse/fallback, generic multi-provider framework or second
  astronomy provider has been added.
- **Expected result:** inherited behavior remains valid and Spike 002 confines
  itself to scoring/canonical forecast expansion; persistence remains deferred.
- **Negative/boundary probes:** concurrent same-location requests still share
  source refreshes, while distinct canonical identities do not.
- **Why sufficient:** covers plausible regression and explicit scope limits,
  not a preferred module decomposition.

## Verification reporting rules

At verification, each procedure above will be recorded with its controlled
inputs, observed result and classification. Any disagreement will be reproduced
and its oracle checked against the frozen brief/calibration before it is called
an implementation failure. `npm run typecheck` and `npm test` are required;
the live integration suite remains optional and cannot replace deterministic
contract evidence.

## Evaluator-integrity note

This is a pre-implementation falsification plan. It deliberately avoids
requiring an internal numeric score, helper API, scoring module layout,
provider DTO layout, persistence design, or hidden reason enum. Exact
calibration boundaries are evaluated because they are accepted product
contract, not because the evaluator has an aesthetic attachment to tables.
