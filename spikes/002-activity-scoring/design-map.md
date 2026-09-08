# Design Map — Spike 002 — Activity Methodology and Scoring

Status: READY

## Shared contracts

- The accepted `calibration.md` is the sole executable source for v1 scoring
  thresholds, sufficiency rules, caps, vetoes, aggregation, and scenario
  outcomes. Design Map, implementation, and evaluation consume it unchanged.
- The provider boundary returns application-selected observations only. Before
  scoring, weather and marine data is represented as a canonical forecast with
  destination-local hourly timestamps and values kept aligned by index/time;
  solar values are keyed to their destination-local date. Provider field names
  and Open-Meteo DTOs do not cross this boundary.
- The canonical marine forecast retains the whole successfully validated fetched
  horizon, not only the seven target dates, so the structural-all-null surf
  rule can be evaluated without confusing a null target date with
  non-applicability.
- Activity scoring produces an internal per-date assessment consisting of its
  public categorical rating and a reason category sufficient for indoor
  sightseeing to distinguish weather-driven weakness, prerequisite absence,
  structural non-applicability, insufficient data, and the global extreme
  veto. GraphQL exposes the categorical ratings only.
- `ForecastService` remains constructible with a provider dependency and clock
  dependency. That is the controlled-input seam for deterministic scoring and
  boundary evaluation; it is not a second public API.

## Inherited contracts

- Canonical provider-backed location identity, seven complete
  destination-local future dates, independent weather/marine acquisition,
  provider-boundary validation, source availability metadata, and
  same-location in-process refresh coalescing remain unchanged.
- Source coverage stays distinct from activity sufficiency. The addition of
  scoring fields must not redefine `AVAILABLE`, `PARTIAL`, `NO_DATA`, or
  `UNAVAILABLE`, nor turn source failure or missing evidence into an
  affirmative unsuitable conclusion.
- The GraphQL result retains resolved location, chronological target-date
  alignment, source metadata, and one categorical rating per activity/date.
  Persistence, request-time reuse, stale fallback execution, and a durable
  schema remain outside this spike.

## Design decisions

- The weather provider boundary owns both selected hourly weather observations
  and requested date-keyed sunrise/sunset values. It validates and maps both;
  scoring obtains solar access data from the canonical forecast rather than a
  separate provider or astronomy dependency.
- The service obtains the two sources independently, preserves each source's
  outcome for metadata, then constructs the canonical forecast and evaluates
  the global override before activity-specific scoring. Indoor sightseeing is
  evaluated only after the three weather-dependent assessments exist.

## Invariants

- A score must not be synthesized from unrelated daily extrema, a provider
  field name, missing data treated as zero/favourable, or an assumed 24-hour
  day.
- The global extreme override has precedence over ordinary activity scoring.
  Surf weather and marine signals are matched at the same local timestamp.
- The four returned rating arrays are all date-aligned and contain actual
  Spike 002 results rather than unconditional placeholders.

## Implementation freedom

- The TypeScript representation and module layout of the canonical forecast,
  scoring functions, internal assessment, and provider DTOs are implementation
  choices, provided the shared contracts and accepted calibration are
  preserved.
- Implementation may use arrays, maps, pure functions, or service-owned
  collaborators for synthesis and scoring. It must not introduce persistence,
  an ORM, a new astronomy provider, or a generic multi-provider framework in
  this spike.
