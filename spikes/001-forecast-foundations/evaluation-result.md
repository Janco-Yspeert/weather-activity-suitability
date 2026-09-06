# Evaluation Result — Spike 001 — Forecast Foundation

Verdict: BLOCKED

## Blocking classification

`CONTRACT_CHANGED`

Verification cannot fairly judge the candidate against the prepared plan
because implementation feedback introduced a new public source state after the
Design Map and evaluation plan were frozen:

- `design-map.md` defines a source with no usable target-date coverage as
  `UNAVAILABLE` (the `otherwise` branch of its three-state rule).
- `evaluation-plan.md` procedure `EVAL-006-C` precommits to the same observable
  result.
- `implementation-report.md` says the candidate instead exposes `NO_DATA` when
  request and validation succeed but every requested target-window observation
  is null, and explicitly says this supersedes the READY Design Map.

The spike brief calls `AVAILABLE`, `PARTIAL`, and `UNAVAILABLE` minimum states,
so an additional state is not inherently invalid. It does not, however, define
the boundary between `NO_DATA` and `UNAVAILABLE`; the Design Map currently does
and contradicts the candidate. The implementation report cannot itself change
that public contract.

The distinction is reasonable but not required to satisfy the current Spike
001 behavior. `UNAVAILABLE` is presently defined broadly as a source that could
not provide usable data. If `NO_DATA` is retained, the brief and Design Map must
define it before the evaluator can accept it. The suggestion that all-null
marine data may later support `UNSUITABLE` also belongs to Spike 002's activity
methodology; Spike 001 must not settle that scoring conclusion by implication.

A second post-preparation contract addition requires the same re-preparation:
the current brief now requires application-owned observation selection with
provider-field translation in the adapter. The prepared plan discusses freedom
of observation choice but does not independently falsify that ownership seam.

## Planned procedure results

No candidate procedure was run after the integrity gate failed. A stale oracle
cannot produce a trustworthy pass or implementation failure.

| Criterion | Procedure results |
| --- | --- |
| `EVAL-001` | `EVAL-001-A` NOT RUN; `EVAL-001-B` NOT RUN; `EVAL-001-C` NOT RUN — blocked by contract change before candidate verification. |
| `EVAL-002` | `EVAL-002-A` NOT RUN; `EVAL-002-B` NOT RUN; `EVAL-002-C` NOT RUN — blocked by contract change before candidate verification. |
| `EVAL-003` | `EVAL-003-A` NOT RUN; `EVAL-003-B` NOT RUN; `EVAL-003-C` NOT RUN; `EVAL-003-D` NOT RUN — the source-state oracle affected by nullability has changed. |
| `EVAL-004` | `EVAL-004-A` NOT RUN; `EVAL-004-B` NOT RUN; `EVAL-004-C` NOT RUN — blocked by contract change before candidate verification. |
| `EVAL-005` | `EVAL-005-A` NOT RUN; `EVAL-005-B` NOT RUN; `EVAL-005-C` NOT RUN; `EVAL-005-D` NOT RUN — blocked by contract change before candidate verification. |
| `EVAL-006` | `EVAL-006-A` NOT RUN; `EVAL-006-B` NOT RUN; `EVAL-006-C` NOT RUN; `EVAL-006-D` NOT RUN; `EVAL-006-E` NOT RUN — `EVAL-006-C` directly conflicts with the candidate's new public state. |
| `EVAL-007` | `EVAL-007-A` NOT RUN; `EVAL-007-B` NOT RUN; `EVAL-007-C` NOT RUN; `EVAL-007-D` NOT RUN; `EVAL-007-E` NOT RUN — blocked by contract change before candidate verification. |
| `EVAL-008` | `EVAL-008-A` NOT RUN; `EVAL-008-B` NOT RUN; `EVAL-008-C` NOT RUN — repository checks cannot substitute for a trustworthy acceptance oracle. |

## Evaluator integrity and limitations

- This is not an `IMPLEMENTATION_FAILURE`: the human explicitly requested the
  changed behavior, and judging it against the superseded three-state oracle
  would punish the candidate for following that feedback.
- This is not repairable as an `EVALUATOR_DEFECT`: adding `NO_DATA` changes
  public acceptance semantics and must be grounded in the brief and Design Map.
- Candidate source and developer tests were not inspected or executed after the
  mismatch was confirmed from the governing artifacts and implementation
  report. Consequently this result makes no claim about the quality or
  correctness of the remaining implementation.
- Once the contract is updated, evaluator preparation must be repeated before
  verification. The new plan must cover both the state distinction and the
  application-owned observation-selection seam.

## Public feedback

Decide and record one public source-state contract:

- If `NO_DATA` is accepted, update the brief and Design Map to distinguish a
  successful, runtime-valid response with no non-null requested observation on
  any target date from request/transport/validation failure. Define its covered
  dates and its relationship to `AVAILABLE`, `PARTIAL`, and `UNAVAILABLE`, while
  leaving any later `UNSUITABLE` inference to Spike 002.
- If the existing three-state contract remains, a successful all-null response
  must expose `UNAVAILABLE`; any finer distinction may remain internal.

Then repeat `evaluator prepare` for Spike 001 and verify the unchanged candidate
against the resulting trustworthy plan.
