# Harness Lite — Take-Home Workflow

This workflow keeps the useful separations in Harness while removing provenance,
runtime-control, and ceremony that do not help a small take-home. The visible
artifacts should make engineering judgment easy to follow, not make the reviewer
learn Harness.

## Work-item contract

Each implementation spike is a work item. Use the same work-item directory for
all skills in that spike.

| Order | Skill invocation                | Reads                                                                                   | Writes                                                            |
| ----- | ------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1     | `brief-readiness <work-item>`   | `brief.md`, optional `source-brief.md`, referenced parent contract, repository evidence | `brief-review.md`                                                 |
| 2     | `design-map <work-item>`        | ready brief, referenced inherited contracts, repository evidence                        | `design-map.md`                                                   |
| 3     | `evaluator prepare <work-item>` | brief, Design Map, inherited public behavior                                            | `evaluation-plan.md`, optional `evaluation-checks/**`             |
| 4     | `implementation <work-item>`    | brief, Design Map, repository instructions, optional sanitized failure feedback         | code, developer tests, `implementation-report.md`                 |
| 5     | `evaluator verify <work-item>`  | contract, prepared plan, candidate, developer tests, implementation report              | `evaluation-result.md`                                            |
| 6     | `as-built <work-item>`          | contract, candidate, evaluation result                                                  | `as-built.md`                                                     |
| 7     | Human review                    | candidate and completed artifacts                                                       | normal edits/commits; optionally note disposition in `WORKLOG.md` |

`outcome` remains available as an optional historical synthesis skill, but it is
not part of the default take-home flow. The README is the final concise product
summary requested by the employer.

The implementation context must not read `evaluation-plan.md` or
`evaluation-checks/**`. It may receive only the `Public feedback` section of a
failed `evaluation-result.md`.

## Three kinds of test evidence

Harness Lite keeps these activities separate because they answer different
questions:

| Evidence                            | Purpose                                                                                    | Timing                                                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Specification examples/invariants   | Define behavior already understood well enough to commit to                                | Before implementation                                                                                                      |
| Developer TDD tests                 | Drive the next small implementation step and prevent implementation-first self-endorsement | Interleaved with implementation                                                                                            |
| Independent evaluator checks/probes | Falsify the completed interpretation, expose omissions, and classify failures              | Prepared before implementation where stable; exercised and, when justified, supplemented after a coherent candidate exists |

A prepared evaluation plan is not a demand to predict every future test before
the code exists. It precommits independent falsification criteria and stable
procedures. Developer tests do not become authoritative merely because they were
written first, and evaluator-authored checks do not become authoritative merely
because they fail.

## Implementation loop

TDD is the default implementation loop **where behavior is understood**:

```text
next observable behavior
  → focused failing test
  → confirm expected RED
  → smallest coherent implementation
  → GREEN + relevant regression checks
  → refactor while green
  → repeat
```

Do not generate the complete test suite upfront. Advance one behavior, or one
tightly related group, at a time.

When progress depends on an unknown external system, runtime, or data shape,
use a bounded discovery probe first:

```text
unknown external reality
  → smallest discovery
  → record the fact learned
  → establish the application-owned boundary
  → discard/quarantine speculative logic
  → resume TDD
```

This is not an exception for implementing uncertain product semantics. If the
unknown is a product decision or observable contract choice, return to the
brief instead.

Generated code, configuration, mechanical wiring, and discovery probes do not
need ceremonial failing tests; verify them with the appropriate build,
typecheck, integration, or smoke check. Reproducible bug fixes should gain a
failing regression test before the fix whenever feasible.

## Using more than one spike

Multiple spikes are useful only when each one retires a distinct uncertainty or
delivers a coherent capability. Do not create one spike per layer, folder, or
technology merely to make the process look structured.

For this assignment, two implementation spikes are a reasonable upper-default:

1. **Forecast foundation** — location resolution, canonical identity, Open-Meteo
   boundary, persistence, freshness, timezone/date-window handling, and
   concurrent refresh coalescing.
2. **Activity suitability and delivery** — activity-specific suitability rules,
   marine data where required, explanations, and the final GraphQL behavior.

A third spike should exist only if a genuine new concern emerges from review,
evaluation, or implementation. Do not pre-create a correction spike in order to
show iteration.

Each later spike must state what it inherits from the project brief and prior
accepted/as-built work, and what it is allowed to change. The final spike's brief
should include the integrated externally observable behavior so its evaluator
can catch regressions across the whole service.

## Control flow

Continue automatically after a passing phase. Do not pause merely to announce a
handoff.

- A readiness or Design Map blocker returns to `brief.md`.
- `IMPLEMENTATION_FAILURE` returns to implementation, where a reproducible
  defect should first gain a focused failing test when feasible; verification
  then reuses the same trustworthy plan.
- `EVALUATOR_DEFECT` corrects the plan and reverifies the unchanged candidate.
- `SPECIFICATION_AMBIGUITY` returns to the brief and repeats affected phases.
- `INFRASTRUCTURE_FAILURE` repairs the environment and retries the affected
  check without changing the contract.
- `CONTRACT_CHANGED` repeats evaluator preparation and downstream phases that
  relied on the previous contract.

Stop for an unresolved product decision, unsafe or unauthorized work, a real
environmental blocker, or final human review. Git may be used normally by the
project, but it is not part of this workflow's authority or handoff mechanism.
