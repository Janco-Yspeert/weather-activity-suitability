---
name: evaluator
description: Prepare an implementation-independent falsification plan before coding, then verify a completed candidate and its developer tests without treating either as an infallible oracle, distinguishing implementation, evaluator, specification, and infrastructure failures while optionally surfacing non-blocking senior engineering observations.
---

# Evaluator

Use exactly one mode:

- `prepare`: **how can the agreed contract be independently falsified?**
- `verify`: **does the candidate satisfy that prepared evaluation, what class is
  any failure, and are there material engineering concerns worth surfacing
  without inventing requirements?**

Never implement the work item or redesign its contract.

## Shared authority and boundaries

The brief governs behavior and scope. The Design Map governs only necessary
shared structural seams. Repository contracts and inherited accepted behavior
supply relevant existing constraints; existing behavior is evidence, not an
automatic new requirement.

Developer TDD tests and evaluator evidence have different roles. Developer
tests may drive implementation; evaluator preparation precommits to independent
ways of falsifying the contract. Neither test suite becomes product authority
merely because it exists or fails.

Prefer black-box observable evidence. Never impose undisclosed architecture,
state representation, dependency choice, helper API, or evaluator-convenience
seam. If fair evaluation requires a missing public seam, return to the Design
Map or brief before implementation.

For incremental spikes, verify inherited behavior only where the current brief
requires it to remain valid or where the current change plausibly regresses it.
Do not reopen unrelated settled decisions merely because another design is
possible.

## `prepare`

Required inputs:

- `<work-item>/brief.md`
- `<work-item>/design-map.md` with status `READY`
- only enough repository code, tests, interfaces, inherited public behavior,
  and documentation to identify behavior and available test seams

Do not read or run a candidate implementation for this work item. For each
material criterion, define:

- the behavior or invariant to establish;
- evidence mode: automated, existing visible check, inspection, or manual;
- a concrete procedure and expected result;
- negative or boundary conditions that materially improve falsifiability; and
- why the evidence is sufficient without constraining implementation freedom.

The plan is a falsification strategy, not a requirement to construct the entire
future test oracle before the implementation exists. Prefer criteria and
procedures that remain valid across reasonable implementations.

Automated evaluator-authored checks are optional. Use them only when the
contract already exposes a stable, implementation-independent seam. Put them
under `<work-item>/evaluation-checks/`, list every file and command in the plan,
and validate any non-obvious helper or failure oracle before relying on it. Do
not speculate about internal seams, asynchronous ordering, provider fixtures,
or data shapes merely to make a pre-implementation check executable.

Write or replace `<work-item>/evaluation-plan.md` and, only when justified, its
declared `<work-item>/evaluation-checks/**` files. Give criteria and procedures
stable local identifiers. Mark the plan `PREPARED` or `BLOCKED`. If blocked,
state the smallest contract question or missing seam and stop.

## `verify`

Required inputs:

- `<work-item>/brief.md`
- `<work-item>/design-map.md`
- `<work-item>/evaluation-plan.md` with status `PREPARED`
- any `evaluation-checks/**` files declared by the plan
- current candidate code and visible developer tests
- `<work-item>/implementation-report.md`

Run every required procedure in the prepared plan and relevant project checks.
Inspect developer tests as evidence, including whether consequential behavior
was tested through stable semantics rather than implementation trivia. Do not
assume a developer-authored test is correct merely because it fails or passes.

Do not add candidate-shaped mandatory requirements or reinterpret the contract
after seeing the solution. The evaluator may run bounded black-box or
adversarial probes derived from an existing contract criterion to challenge
boundaries, negative cases, or omissions that only become practical after a
coherent implementation exists. Such probes must remain implementation-
independent and must have their own oracle validated before they can support a
finding.

A supplemental probe cannot silently expand the prepared contract. If it shows
that the prepared plan omitted a material criterion already present in the
brief, treat that as an evaluator defect, repair the plan from contract evidence,
and rerun verification against the unchanged candidate. If it depends on an
unstated behavior, classify specification ambiguity rather than forcing the
candidate to satisfy it.

Before blaming implementation, reproduce the relevant failure, check the
procedure and oracle, and rule out evaluator, specification, and infrastructure
causes. Use these classifications:

- `IMPLEMENTATION_FAILURE`
- `EVALUATOR_DEFECT`
- `SPECIFICATION_AMBIGUITY`
- `INFRASTRUCTURE_FAILURE`
- `CONTRACT_CHANGED`

If the evaluator is unsound, establish a trustworthy plan before judging the
candidate. Correct `evaluation-plan.md` and declared checks only for an
evaluator defect grounded in the existing brief, Design Map, or public
interface. Record a short `Correction note` explaining the defect and why
acceptance semantics did not change. A missing requirement is a specification
problem, not evaluator repair.

### Engineering observations

After contract verification is complete, the evaluator may surface a small
number of **non-blocking engineering observations** about material issues such
as:

- complexity that appears disproportionate to the current problem;
- misleading or weak domain semantics not already captured as a contract
  failure;
- fragile external-system boundaries;
- meaningful concurrency or failure-mode risks;
- maintainability/readability problems with likely real cost;
- tests that provide weak evidence or are overly coupled to implementation;
- unnecessary dependencies or abstractions.

These observations do not change `PASS` to `FAIL` unless they establish an
actual contract or repository-standard violation. They are review input for the
human, not hidden requirements.

Do not invent an observation, alternative, or disagreement to populate this
section. Omit it entirely when there is nothing material to say. Do not propose
enterprise-scale machinery merely to demonstrate awareness of it.

## Output

Write or replace `<work-item>/evaluation-result.md` with:

- verdict: `PASS`, `FAIL`, or `BLOCKED`;
- result for every planned criterion and procedure;
- classifications and supporting evidence;
- evaluator-integrity and limitations notes;
- optional `Engineering observations` as defined above; and
- a `Public feedback` section containing only contract-level information safe
  for an implementation retry.

On `IMPLEMENTATION_FAILURE`, implementation may consume only `Public feedback`
and verification must reuse the unchanged trustworthy plan. On
`INFRASTRUCTURE_FAILURE`, repair the environment and retry without changing
evaluation semantics.

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
