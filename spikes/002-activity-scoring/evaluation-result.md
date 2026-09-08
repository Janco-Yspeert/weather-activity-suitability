# Evaluation Result — Spike 002 — Activity Methodology and Scoring

Verdict: FAIL

## Required checks

- `npm test` — PASS: 38 deterministic tests passed.
- `npm run typecheck` — PASS.
- `npm run test:integration` — PASS: 4 opt-in live Open-Meteo tests passed.
- `git diff --check` — PASS.

The live suite is supplemental provider-boundary evidence; deterministic
controlled inputs decide the scoring findings below.

## Planned-criterion results

### EVAL-01 — Application-owned observation boundary and retained alignment

PASS. Inspection and deterministic provider tests show all v1 weather and
marine inputs are selected as application-owned observations and translated at
the Open-Meteo boundary. Weather validation maps date-keyed sunrise/sunset;
marine data retains its fetched horizon; scoring consumes timestamped canonical
observations. The request construction uses no extra astronomy provider.

The scorer joins surf weather/marine values by equal local timestamp, so values
at different hours are not combined into a synthetic session. Its actual-local
hour calculation is, however, implicated in the coverage failures below.

### EVAL-02 — Global override has narrow local-time scope and precedence

PASS. The deterministic global-heat test passes. Independent probes also
confirmed that three consecutive 10:00–12:00 blizzard-like observations make
all four activities `UNSUITABLE`, while two >=45 C observations at 03:00–04:00
do not create a global veto. Inspection confirms the remaining accepted
triggers, thresholds, consecutive-hour test and 06:00–22:00 local filter.

### EVAL-03 — Evidence semantics and inherited source metadata remain honest

FAIL — `IMPLEMENTATION_FAILURE`.

`AVAILABLE`/`PARTIAL`/`NO_DATA`/`UNAVAILABLE` metadata retains the inherited
weak source-coverage semantics, and failed/missing values generally become
`UNKNOWN`. But a target date with a small number of returned complete records
can be reported as source-covered and then treated as fully activity-sufficient.
That collapses the required distinction between source coverage and activity
sufficiency. The reproducible surf and ski results are recorded under EVAL-05
and EVAL-07.

### EVAL-04 — Outdoor windows, score shape, caps and daily aggregation

PASS. Visible tests and code inspection cover the accepted dry, sustained-rain,
window-sufficiency, thunderstorm/visibility, cap and daily-aggregation rules.
Three-hour local contiguity is required; missing ordinary fields are not
zero-filled; and a pure arithmetic score cannot defeat the documented caps or
vetoes.

### EVAL-05 — Surf sessions use aligned daylight evidence and discrete opportunities

FAIL — `IMPLEMENTATION_FAILURE`.

The aligned-input, solar-period, 2-hour opportunity, maximal-run, chop, wind,
wave-veto and aggregation behavior follows the frozen calibration for complete
input. However, `scoreSurf` derives `expected` slots by filtering *returned
weather records* in the solar period, then uses `scored.length / expected.length`
for the 70% sufficiency calculation. Missing expected local hours reduce the
denominator instead of reducing coverage.

Reproduction: with solar 06:00–18:00 and only two returned, aligned, excellent
records at 09:00 and 10:00, the candidate returns surf `GOOD`. The accepted
rule requires coverage against all hourly slots in `sunrise - 90 minutes`
through `sunset + 60 minutes`; two such records are below 70% and must return
`UNKNOWN`. This is not a fixed-24-hour requirement: it is the explicitly
defined, actual local surf-access period.

### EVAL-06 — Surf non-applicability requires complete structural evidence

PASS. A successfully validated horizon whose three required marine series are
all null produces structural surf `UNSUITABLE`; a null source/failure produces
`UNKNOWN`. The implementation checks the retained full source horizon rather
than inferring non-applicability from one target date.

### EVAL-07 — Skiing treats snow as a sufficient prerequisite and needs sustained opportunity

FAIL — `IMPLEMENTATION_FAILURE`.

Snow bands, credible no-snow, weather caps, optional cloud renormalisation and
4-hour continuity follow the accepted calibration where the ski period is
actually represented. But `scoreSki` similarly sets `expected` to the returned
08:00–17:00 records. Its 70% ordinary/snow-depth coverage checks and usable
fraction therefore use a truncated denominator.

Reproduction: with only four returned, otherwise excellent ski records at
08:00–11:00, including 0.4 m snow depth, the candidate returns skiing
`EXCELLENT`. The defined 08:00–17:00 local ski period has those four records
as only partial evidence, below the 70% ordinary and snow-depth sufficiency
requirements, so the required result is `UNKNOWN`. Again, this demands the
actual local activity period, not an assumed 24-hour day.

### EVAL-08 — Indoor assessment honours reasoned opportunity cost

PASS. The global override, ordinary-weather insufficiency, default `GOOD`,
weather-only `EXCELLENT` boost, structural/prerequisite exclusions, and
unknown-data exclusion match the accepted indoor scenarios. Indoor never
emits `FAIR` or `POOR`.

### EVAL-09 — Inherited lifecycle and scope are preserved

PASS. The inherited deterministic tests pass: location/date behavior,
independent source outcomes and same-location in-flight coalescing remain
intact. Inspection found no persistence layer, ORM, durable schema,
request-time snapshot reuse/fallback, extra astronomy provider or generic
multi-provider framework.

## Failure classification and oracle check

Classification: `IMPLEMENTATION_FAILURE`.

The prepared plan requires surf's 70% coverage of expected solar-access slots
and skiing's 70% coverage of expected ski-period hours. The accepted
calibration states both rules directly. The probes use finite, timestamp-aligned
application-owned data and deliberately omit records; the provider boundary
permits partial source horizons, and inherited source metadata treats a date
with one usable observation as covered. The oracle is therefore sound and the
failure is neither a provider failure nor a demand for a 24-record day.

## Evaluator integrity and limitations

No candidate implementation was read during evaluator preparation, and the
prepared plan was not changed during verification. No evaluator-authored check
files were declared. Verification used the plan's inherited provider/clock seam,
GraphQL-visible contract, source inspection and bounded direct deterministic
probes. The test suites passing does not outweigh the reproduced contract
failures; they simply did not exercise truncated activity-period records.

## Public feedback

Correct activity-data sufficiency so that surf's 70% threshold is measured
against the expected hourly slots in the destination-local
`sunrise - 90 minutes` to `sunset + 60 minutes` access period, and skiing's
70% thresholds/fraction are measured against the expected hourly slots in the
destination-local 08:00–17:00 ski period. Do not derive either denominator
solely from records returned by a partial source. Preserve the DST rule: use
the actual local period rather than assuming 24 records. Add deterministic
regressions for truncated-but-otherwise-excellent surf and ski periods, which
must return `UNKNOWN` when below their coverage thresholds.
