# Evaluation Result — Spike 002 — Activity Methodology and Scoring

Verdict: PASS

## Required checks

- `npm run typecheck` — PASS.
- `npm test` — PASS: 104 deterministic tests across 7 files.
- Existing stable evaluator-contract suite — PASS. The service-seam probes for
  EVAL-02, EVAL-05 and EVAL-07 and the 205-case calibration-boundary/evidence
  snapshot ran as part of `npm test`.
- `git diff --check` — PASS.
- `npm run test:integration` — PASS: 4 live Open-Meteo integration tests.
  This remains supplemental evidence and did not decide the scoring verdict.

## Planned-criterion results

### EVAL-01 — Application-owned observation boundary and retained alignment

PASS. The provider request and runtime boundary retain the complete v1 weather,
marine and date-keyed solar observations under application-owned names. The
scoring modules consume canonical weather and marine hours rather than
Open-Meteo field names. Surf evidence is aligned independently to generated
expected local slots; the service-seam regression proves weather and marine
values at different timestamps cannot form a synthetic session.

The inherited provider tests cover field translation, nullable data, array
alignment and semantically valid local timestamps. Destination-local date tests
cover 23- and 25-hour dates, while the scoring regression covers a repeated
fall-back hour as two distinct expected slots.

### EVAL-02 — Global override has narrow local-time scope and precedence

PASS. Deterministic service-seam cases establish the exact two-hour heat and
cold boundaries, non-consecutive hours, single hours, immediately sub-threshold
values and night-only extremes. Visible tests cover all six accepted triggers
and multiple simultaneous triggers. Inspection confirms only 06:00–22:00 local
hours participate, consecutive evidence is required where specified, absent
fields do not trigger a veto, and any detected extreme sets all four activities
to `UNSUITABLE` before ordinary scoring.

### EVAL-03 — Evidence semantics and inherited source metadata remain honest

PASS. Forecast-service tests preserve `AVAILABLE`, `PARTIAL`, `NO_DATA` and
`UNAVAILABLE` independently for weather and marine, distinct from activity
sufficiency. Provider failure and missing ordinary evidence remain `UNKNOWN`;
successfully validated structural marine absence retains its separate
affirmative rule. The GraphQL check returns seven chronological dates and four
date-aligned rating arrays with the service's real results.

Generated expected surf and ski slots remain the denominators. Stable probes
confirm that removing observations does not shrink coverage, bridge a gap,
create another opportunity or contribute favourable utility. Sparse adverse
evidence remains `UNKNOWN` unless an independently sufficient affirmative rule
applies.

### EVAL-04 — Outdoor windows, score shape, caps and daily aggregation

PASS. The deterministic suite and retained 205-case snapshot exercise the
accepted temperature, precipitation, wind, gust, visibility and weather-code
boundaries, including null and non-finite evidence. Inspection confirms
complete aligned three-hour windows, the accepted weighted/rounded utility,
heavy-rain and low-visibility caps, thunderstorm and sub-200 m vetoes, and the
best-window-plus-usable-hours aggregation matrix. A two-hour fragment remains
`UNKNOWN`; missing required observations are not zero-filled.

### EVAL-05 — Surf period and opportunity sufficiency use the expected solar timeline

PASS. Surf access slots are still generated from sunrise minus 90 minutes
through sunset plus 60 minutes in the destination timezone, independently of
returned observations. Same-slot alignment and expected indices preserve gaps
and repeated local hours.

The stable evaluator-contract cases reconfirm the prepared partial-evidence
oracle: one excellent hour is `UNKNOWN`; two excellent hours are `GOOD`; two
good hours are `FAIR`; three good hours are `GOOD`; a fair opportunity remains
`FAIR`; four excellent hours are capped at `GOOD`; a missing hour breaks the
opportunity; sparse adverse evidence is `UNKNOWN`; and two separate partial
opportunities use only the best single opportunity. Sufficient-coverage
aggregation, period relationships, exact wave/wind thresholds, large-wave
vetoes and missing-solar behavior are covered by the boundary snapshot,
developer scenarios and inspection.

The accepted post-prepare flat-water refinement intentionally changes only the
`<0.30 m` cases: individual hours are capped at `POOR`; sparse flat evidence
cannot form a positive fallback; and sufficiently evidenced all-flat access
periods are `UNSUITABLE`. The five affected characterization rows changed for
that explicit reason; other captured ratings remain unchanged.

### EVAL-06 — Surf non-applicability requires complete structural evidence

PASS. A successfully validated full-horizon all-null result for all three
required marine series yields structural non-applicability. A provider failure
yields `UNKNOWN`, and retained non-null evidence beyond the target dates
prevents the structural inference. A null target date cannot masquerade as a
null fetched horizon.

### EVAL-07 — Ski period and opportunity sufficiency preserve the snow prerequisite

PASS. Both ordinary and snow-depth coverage still use the ten generated slots
from 08:00 through 17:00. Stable probes reconfirm the exact 70% transition,
four-hour block requirement, missing-hour split, sparse-adverse safeguard and
the full block-local snow table: `<0.01 m` and `0.01–<0.05 m` are `UNKNOWN`
under partial evidence, `0.05–<0.15 m` is `FAIR`, and `0.15 m` or more can
support the partial `GOOD` cap. Whole-period temperature modifiers and usable-
fraction bonuses are not borrowed by incomplete periods.

Separately sufficient snow-depth evidence with median below `0.01 m` remains
the affirmative `UNSUITABLE` prerequisite even when ordinary ski fields are
incomplete. The boundary snapshot and inspection retain the rain, wind,
visibility, temperature, snowfall, cloud renormalisation and marginal-snow
caps, with no elevation or resort-availability gate.

### EVAL-08 — Indoor assessment honours reasoned opportunity cost

PASS. Indoor still returns `UNKNOWN` when ordinary outdoor evidence is
insufficient, `UNSUITABLE` under the global veto, `GOOD` by default, and
`EXCELLENT` only when sufficiently evidenced weather removes the outdoor
alternatives. Provider uncertainty cannot boost indoor, while ski prerequisite
absence and structural surf non-applicability are excluded from false weather-
opportunity-cost claims. Indoor emits neither `FAIR` nor `POOR`.

### EVAL-09 — Inherited lifecycle and scope are preserved

PASS. Inherited tests reconfirm canonical location identity, seven destination-
local dates, independent weather/marine outcomes, same-location refresh
coalescing, distinct-location isolation and retry after degraded refresh. The
current dependencies and implementation contain no persistence, ORM, request-
time snapshot reuse/fallback, second astronomy provider or generic multi-
provider framework.

## Classification

No `IMPLEMENTATION_FAILURE`, `EVALUATOR_DEFECT`, `SPECIFICATION_AMBIGUITY` or
`INFRASTRUCTURE_FAILURE` affected the prepared verification. The substantial
module refactor preserved the stable contract, and the accepted advisory/flat-
surf additions did not invalidate its nine criteria. The live integration
suite also completed without the previously observed network instability.

## Evaluator integrity and limitations

The prepared plan and its acceptance semantics were not changed during this
verification. Evidence came from the public scorer and `ForecastService`
boundaries, provider/GraphQL checks, stable regression probes and targeted
inspection; no private helper API or candidate-specific architecture was made
mandatory.

The public advisory addendum was accepted after evaluator preparation. Its
GraphQL shape, sparse/date-keyed output, global trigger codes, structural surf
code, daily versus forecast no-snow behavior, large-surf qualification and
flat-surf uncertainty rule all pass visible deterministic tests and inspection.
That is useful supplemental evidence, but it is not represented as a newly
precommitted criterion in this unchanged plan. A future preparation pass would
be required only if the advisory addendum itself needs a formally independent
acceptance contract.

The live suite is useful boundary evidence but cannot prove scoring semantics
and did not determine the verdict.

## Public feedback

The candidate satisfies the prepared Spike 002 evaluator contract after the
scoring refactor and advisory amendment. Expected-slot denominators, temporal
continuity, sparse-evidence safeguards, source uncertainty, global/structural/
no-snow precedence, indoor reason semantics, GraphQL alignment and inherited
lifecycle behavior remain intact. No implementation retry is required.
