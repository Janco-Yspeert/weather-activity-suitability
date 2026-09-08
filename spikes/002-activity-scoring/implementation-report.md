# Spike 002 advisory amendment implementation report

Status: IMPLEMENTED

## Changed

- Added sparse date-keyed daily advisories and forecast-scoped advisories to
  activity-scoring results, `ForecastAssessment`, and the GraphQL schema.
- Preserved all independently established global-extreme triggers as stable
  public codes without changing global-veto precedence.
- Added daily `SKIING_NO_SNOW` and `LARGE_SURF` advisories only when their
  existing affirmative conditions make the activity `UNSUITABLE`.
- Added the sufficiently evidenced flat-surf rule: at ordinary period
  sufficiency, all scorable access-period wave heights below `0.30 m` now make
  surfing `UNSUITABLE` with `NO_SURF`. Partial evidence retains the existing
  uncertainty behavior and does not emit the absence advisory. Individual
  flat-water hours are capped at `POOR`, so they cannot form an opportunity.
- Added forecast-scoped `SURFING_NOT_APPLICABLE` for successful structural
  marine null evidence.
- Added forecast-scoped `SKIING_NO_SNOW_FORECAST` when every returned target
  date independently establishes the no-snow prerequisite, suppressing the
  redundant daily no-snow codes. Proper subsets remain date-scoped.

## Consequential implementation decisions

- Surf scoring records domain details (`FLAT_SURF` and
  `SURF_OUTSIDE_RECREATIONAL_RANGE`) on its internal assessment. The scoring
  orchestrator maps those details to public advisory codes, so GraphQL
  vocabulary does not become the scorer's control-flow model.
- Forecast-wide no-snow consolidation occurs only after every target date has
  been assessed. An empty date set cannot establish the forecast conclusion,
  and `UNKNOWN` or global-vetoed dates do not count as no-snow evidence.
- `LARGE_SURF` is emitted only when the calibrated large/powerful-surf veto
  contributes to an overall `UNSUITABLE` surf day. An isolated vetoed hour on
  an otherwise recommendable day does not produce the advisory.

## Tests that drove behavior

- Focused tests cover every global trigger code, multiple triggers on one date,
  sparse daily output, structural surf non-applicability, large-surf outcome
  qualification, full versus partial flat-surf evidence, and partial versus
  all-date no-snow consolidation.
- The rating characterization snapshot records the five intentional changes
  from score-derived flat-surf ratings to the new affirmative `UNSUITABLE`
  result below `0.30 m`.

## Unexpected implementation discovery

- The calibration was clarified during implementation to cap each flat-water
  hour at `POOR`. Without that cap, favourable period and wind inputs could
  incorrectly create a positive partial-evidence opportunity even though wave
  height was below the model's meaningful range.

## Verification

- Focused activity-scoring, forecast-service, and GraphQL tests: 40 passed
  before the additional boundary regressions.
- `npm test`: 104 tests passed after updating the intentional flat-surf
  characterization changes.
- `npm run typecheck`: passed.
- `git diff --check`: passed.
- Live Open-Meteo integration tests were not run because this amendment does
  not change provider requests, validation, mapping, or external behavior.

No independent evaluator was run or claimed by this phase.
