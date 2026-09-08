# Evaluation Result — Spike 002 — Activity Methodology and Scoring

Verdict: PASS

## Required checks

- `npm run typecheck` — PASS.
- `npm test` — PASS: 44 deterministic tests across 6 files.
- Supplemental amended-contract probe — PASS: 24 independent assertions
  exercised through the `ForecastService` provider/clock seam; the temporary
  probe file was removed after execution.
- `git diff --check` — PASS.
- `npm run test:integration` — not rerun. It is optional evidence, and the
  repair did not alter provider requests, parsing, or validation.

## Planned-criterion results

### EVAL-01 — Application-owned observation boundary and retained alignment

PASS. `ForecastService` requests the complete application-owned v1 observation
set. `OpenMeteoClient` owns provider-field translation, validation, local
timestamps, and date-keyed sunrise/sunset. Scoring receives canonical values
and aligns surf weather and marine records to the same expected local slot;
values from different timestamps cannot be combined into a synthetic hour.

The visible boundary tests cover all selected fields, misaligned arrays,
semantically invalid timestamps, and 23/25-hour local dates. Inspection confirms
expected slots are generated from real instants in the destination timezone and
retain repeated local-hour occurrences instead of assuming a 24-hour day.

### EVAL-02 — Global override has narrow local-time scope and precedence

PASS. The current deterministic suite confirms in-period extreme heat makes all
four activities `UNSUITABLE`. Inspection confirms the accepted gust, freezing
rain, thunderstorm, blizzard-like, extreme-heat, and extreme-cold triggers use
the 06:00–22:00 local period and preserve global precedence. The prior bounded
blizzard and night-only-heat probes remain applicable; the repair did not touch
this logic. Missing hazard values do not themselves trigger the override.

### EVAL-03 — Evidence semantics and inherited source metadata remain honest

PASS. Source state remains derived by the inherited weak per-date coverage
definition and is independent of activity sufficiency. The service tests
confirm `AVAILABLE`, `PARTIAL`, `NO_DATA`, and `UNAVAILABLE` degradation without
turning missing provider evidence into an affirmative unsuitable conclusion.

The supplemental probe confirms missing surf/ski timestamps remain absent
expected slots: they do not shrink denominators, bridge gaps, create additional
opportunities, or contribute favourable utility. Sparse ordinary adverse
evidence returns `UNKNOWN` below period sufficiency.

### EVAL-04 — Outdoor windows, score shape, caps and daily aggregation

PASS. Current visible tests and inspection confirm three-hour contiguity,
required-field completeness, weighted bands, heavy-rain and poor-visibility
caps, thunderstorm vetoes, gust caps, usable-hour aggregation, and the accepted
dry/light-rain/light-snow behavior. Outdoor scoring is unchanged by the surf/ski
sufficiency repair and does not zero-fill missing evidence.

### EVAL-05 — Surf period and opportunity sufficiency use the expected solar timeline

PASS. Surf coverage is now measured against every expected local hourly slot
from sunrise minus 90 minutes through sunset plus 60 minutes, independently of
returned weather or marine records. Same-slot alignment and expected-slot
indices preserve real contiguity.

Independent probes established the amended below-70% oracle:

- two excellent hours → `GOOD`;
- two good hours → `FAIR`;
- three good hours → `GOOD`;
- a valid fair opportunity → `FAIR`;
- one excellent hour → `UNKNOWN`;
- four excellent hours → `GOOD`, not `EXCELLENT`;
- a missing hour splits the opportunity;
- sparse adverse evidence → `UNKNOWN`; and
- two separate two-hour good opportunities still use only the best single
  opportunity and produce `FAIR`.

At sufficient coverage, inspection and visible tests confirm the original
single- and multi-opportunity aggregation remains unchanged. Missing solar data
remains `UNKNOWN`, while the structural rule retains its separate precedence.

### EVAL-06 — Surf non-applicability requires complete structural evidence

PASS. Visible deterministic checks distinguish a successfully validated
full-horizon all-null set of all three required marine series (`UNSUITABLE`)
from provider failure (`UNKNOWN`). Inspection confirms a null target date or a
partially null horizon cannot establish structural non-applicability, and the
full retained horizon is examined.

### EVAL-07 — Ski period and opportunity sufficiency preserve the snow prerequisite

PASS. Ordinary scorable and snow-depth coverage use the ten expected local
slots from 08:00 through 17:00. The supplemental probe confirmed that 60%
coverage follows the partial fallback while exactly 70% follows ordinary
aggregation, so returned records cannot redefine the denominator.

Independent partial-evidence probes established:

- four excellent hours → `GOOD`, while three → `UNKNOWN`;
- four good or fair hours → `FAIR`;
- missing hours split candidate blocks;
- sparse unsuitable rain evidence → `UNKNOWN`;
- block-median snow `<0.01 m` and `0.01–<0.05 m` → `UNKNOWN` when the
  independent prerequisite lacks sufficient evidence;
- block-median snow `0.05–<0.15 m` → `FAIR`;
- block-median snow `0.15–<0.30 m` and `>=0.30 m` → `GOOD`; and
- the wider-day warm/marginal-snow modifier is not applied to an incomplete
  period.

Visible and independent checks also confirm that snow-depth evidence covering
at least 70% of expected slots with median depth below 0.01 m remains the
separate `UNSUITABLE` prerequisite even when other required ski evidence is
missing.

### EVAL-08 — Indoor assessment honours reasoned opportunity cost

PASS. Visible tests and inspection confirm the global override, ordinary-
weather insufficiency, default `GOOD`, weather-only `EXCELLENT` boost, and the
exclusion of unknown, structural, and prerequisite absence from false weather
opportunity-cost claims. Indoor emits neither `FAIR` nor `POOR`.

### EVAL-09 — Inherited lifecycle and scope are preserved

PASS. All inherited deterministic checks pass. Canonical-location refresh
coalescing, independent source outcomes, location/date alignment, GraphQL
ratings, and source metadata remain intact. Inspection found no persistence,
ORM, request-time snapshot reuse, second astronomy provider, or generic
multi-provider framework added by Spike 002.

## Classification

No contract failure remains. The prior evaluator result was correctly rendered
`CONTRACT_CHANGED` by the human-accepted sufficiency amendment; the candidate
now satisfies the re-prepared oracle.

An initial run of the temporary supplemental probe failed because the probe
contained a stray unary `+` in its fixture construction. This was an
`EVALUATOR_DEFECT`, not candidate evidence. The fixture was corrected without
changing its oracle or the candidate, and the complete probe then passed.

## Engineering observations

- `src/activity-scoring.ts` remains a large, densely coupled concentration of
  calibration tables, aggregation rules, temporal helpers, and reason mapping.
  This is non-blocking, but the already-recorded readability refactor is now a
  sensible follow-up provided behavior remains protected by tests.
- Developer tests cover the core denominator regressions and principal partial
  fallbacks, but several accepted branches required supplemental evaluator
  coverage: three-hour good/fair surf mapping, best-single surf behavior, the
  complete block-local ski snow table, and the exact 70% ski transition. Those
  are worth promoting into durable developer tests before structural cleanup.

## Evaluator integrity and limitations

The re-prepared plan was not changed during verification. The supplemental
probe was derived only from its existing EVAL-03, EVAL-05, and EVAL-07 criteria
and accepted calibration scenarios; it imposed no private API, representation,
or dependency requirement. Its temporary file was removed after execution.

Deterministic controlled evidence decides this verdict. The live Open-Meteo
suite was not required because no provider-boundary behavior changed, and a
network result could not validate these scoring semantics anyway.

## Public feedback

The candidate satisfies the amended Spike 002 contract. Expected surf and ski
periods no longer shrink with returned observations; complete minimum
opportunities support only the specified conservative partial-evidence ratings;
sparse evidence does not manufacture negative conclusions; and the affirmative
global, structural-marine, and no-snow rules retain precedence. No implementation
retry is required.
