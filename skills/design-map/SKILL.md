---
name: design-map
description: Establish the smallest shared design contract needed for independent implementation and evaluation after a brief is ready, including inherited seams for incremental spikes, without turning ordinary implementation choices into requirements.
---

# Design Map

Answer one question: **what is the smallest structural contract that
implementation and evaluation must interpret the same way?**

## Input

Argument: `<work-item-directory>`.

Required:

- `<work-item>/brief.md`
- `<work-item>/brief-review.md` with `READY` or `READY WITH MINOR EDITS`
- relevant repository instructions, contracts, code, public interfaces, and
  tests

Also read parent/inherited contracts or accepted/as-built behavior when the
current brief explicitly depends on them.

Do not read `evaluation-plan.md` or current-spike implementation artifacts.

## Boundaries

Prefer evaluation through externally observable behavior. Add a shared
structural decision only when implementation and evaluation could otherwise
choose incompatible but individually reasonable seams.

The map may settle a bounded import or construction surface, artifact location,
ownership boundary, lifecycle responsibility, persistence seam, identity seam,
or testability seam when all valid choices preserve the brief's behavior and
scope.

For incremental spikes, preserve inherited shared contracts unless the current
brief explicitly changes them. Record only inherited seams that materially
constrain the current work; do not restate earlier architecture wholesale.

The map must not decide omitted product behavior, failure semantics, scoring
algorithms, thresholds, dependencies, class hierarchies, file layouts needed
only by implementation, or architecture introduced merely for evaluator
convenience.

If a necessary decision changes observable behavior or scope, stop and return
it to `brief.md`. If only implementation needs the decision, preserve it as
implementation freedom.

## Output

Write or replace only `<work-item>/design-map.md`. Use only relevant sections:

```markdown
# Design Map — <work item>

Status: READY | BLOCKED

## Shared contracts

## Inherited contracts

## Design decisions

## Invariants

## Implementation freedom

## Blocking contract questions
```

Omit empty sections. Do not duplicate the brief, catalogue files, or write an
implementation plan. Do not leave a required shared contract open: decide it
within this skill's authority or mark the map `BLOCKED` and return to the brief.

## Worklog

`./WORKLOG.md` is the chronological record of how the work evolved.

Append a short entry when this skill:

- makes or materially changes a consequential decision;
- surfaces a finding that changes the planned work;
- records a deliberate deferral or rejected alternative;
- discovers external behaviour that affects the design;
- completes a meaningful workflow phase.

Do not log routine execution, restate the skill report, or manufacture
decision history after the fact.

Append only. Do not rewrite or tidy earlier entries.
Keep entries concise and factual.
