---
name: implementation
description: Implement a ready work item from its brief and Design Map using test-driven increments where behavior is known, bounded discovery where external reality is unknown, ordinary coding judgment, visible tests, and a concise decision-aware handoff without claiming independent verification.
---

# Implementation

Answer one question: **does the agreed work item now exist in the repository as
a coherent, maintainable implementation?**

## Input

Argument: `<work-item-directory>`.

Required:

- `<work-item>/brief.md`
- `<work-item>/design-map.md` with status `READY`
- repository instructions and relevant existing code and tests

Read inherited accepted/as-built behavior when the brief or Design Map says the
current spike depends on it.

Optional on a confirmed retry:

- only the `Public feedback` section supplied from
  `<work-item>/evaluation-result.md`

Do not read `evaluation-plan.md`, `evaluation-checks/**`, evaluator notes, or
non-public diagnostic mechanics. If they are already in context, stop and
request a fresh implementation context.

## Work

Inspect current repository state and preserve unrelated changes. Implement the
smallest coherent solution satisfying the brief and Design Map. Do not broaden
scope, implement non-goals, or add dependencies and abstractions without a
current concrete benefit.

Resolve ordinary internal choices yourself and continue. Coding judgment is
expected; do not stop for naming, local structure, helper extraction, test
arrangement, or similarly reversible choices.

Stop rather than guess when a choice would materially change product meaning,
public/API behavior, persistence semantics, failure semantics, an inherited
contract, or an explicitly agreed design boundary.

When making a consequential implementation decision, prefer the least complex
choice that satisfies current requirements while keeping real volatility at an
appropriate boundary. Do not add generic abstractions for hypothetical future
providers, distributed deployments, or scale unless the current problem earns
them.

## Test-driven implementation

Use **test-first where behavior is understood; discovery-first where external
reality is not yet known**.

For each behavior-changing implementation slice:

1. Identify the next observable behavior or invariant.
2. When that behavior is understood, write one focused failing test, or one
   tightly related group, before production code.
3. Run it and confirm it fails for the intended reason rather than because the
   test, fixture, environment, or assumption is wrong.
4. Implement the smallest coherent change that makes it pass.
5. Run the focused test and relevant regression tests.
6. Refactor only while the relevant suite remains green.

Repeat in small increments. Do not manufacture a comprehensive speculative test
suite before implementation starts. Tests should assert contract behavior and
meaningful invariants rather than an imagined class structure or helper API.
Prefer real in-process collaborators where practical; substitute or control
true system boundaries, time, randomness, and failures when determinism is
needed.

A failing test is evidence, not authority. If its expected result conflicts
with the brief, inherited contract, provider reality, or a valid alternative
implementation, correct the test or return the ambiguity to the appropriate
contract rather than distorting production code to satisfy a false oracle.

### Bounded discovery

When the next behavior depends on unknown provider semantics, runtime behavior,
data shape, framework integration, or another fact that cannot be responsibly
specified yet, perform the smallest bounded discovery needed to establish that
fact. Record what was learned, establish the application-owned boundary or
contract, then resume the test-driven loop.

Exploratory production logic must not quietly become the implementation merely
because it happened to work. Discard or quarantine speculative logic once the
boundary is understood. Harmless scaffolding or configuration may remain when
it is independently justified and does not encode an unreviewed behavior.

Generated code, declarative configuration, mechanical wiring with no meaningful
behavior, and bounded discovery probes do not require a ritual failing test;
verify them with the appropriate build, type, integration, or smoke check.

For a reproducible bug fix, add a focused test that demonstrates the defect
before applying the fix whenever technically feasible.

Run relevant tests, static checks, and the broader suite where practical.
Inspect the resulting changes for unrelated work and explicit non-goals. Report
pre-existing failures instead of silently repairing them.

Git may help inspect changes when available, but no branch, commit, clean tree,
or push is required by this skill.

## Output

May change only the implementation, visible tests, and
`<work-item>/implementation-report.md`.

The report must contain only material information and should omit empty
sections. Include:

- status: `IMPLEMENTED` or `BLOCKED`;
- files and behavior changed;
- **consequential implementation decisions** — choices that materially affect
  maintainability, external integration, concurrency, persistence, failure
  behavior, testability, or complexity, with the reason for the choice;
- **rejected complexity or alternatives** — only where a real alternative was
  considered and rejected for a concrete reason;
- notable tests that drove consequential behavior, where useful to explain the
  implementation rather than to reproduce every RED/GREEN cycle;
- bounded discovery performed and what fact or boundary it established;
- unexpected implementation discoveries that affected the work;
- tests and checks run, with results;
- skipped checks, assumptions, limitations, and unrelated failures.

Do not present a decision inherited from the brief or Design Map as though it
were an implementation decision. Do not manufacture alternatives, discovery,
or disagreement to make the report look thoughtful.

Do not claim independent evaluation passed. The current candidate, visible
tests, and this report are the evaluator's inputs.

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
