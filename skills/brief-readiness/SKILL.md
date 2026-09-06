---
name: brief-readiness
description: Review a candidate-authored work-item brief against the supplied assignment, inherited contracts, and repository evidence before design or implementation, surfacing only ambiguities or feasibility issues that materially block a fair implementation contract.
---

# Brief Readiness

Answer one question: **is this authored brief ready to govern independent design,
implementation, and evaluation without silently losing or inventing product
requirements?**

## Input

Argument: `<work-item-directory>`.

Required:

- `<work-item>/brief.md`
- repository instructions and only the code, tests, public interfaces, and
  product documentation needed to check the brief

Read when present or explicitly referenced by the brief:

- `<work-item>/source-brief.md` containing the supplied assignment or ticket;
- a parent/project brief inherited by an incremental spike;
- prior accepted/as-built behavior that the spike explicitly depends on.

The authored `brief.md` may resolve ambiguity and add assumptions, but it must
not silently drop, weaken, or contradict a supplied requirement. A deliberate
deviation must be explicit enough for a reviewer to see it.

Do not read `design-map.md`, `evaluation-plan.md`, implementation reports, or
later workflow artifacts. Do not implement, design the solution, or silently
resolve product choices for the author.

## Review

Trace each material authored requirement to the supplied brief and existing
repository contracts where relevant. Focus on issues that change scope,
observable behavior, feasibility, fair evaluation, lifecycle, concurrency,
failure behavior, ownership, or meaningful cost.

For incremental spikes, also check that the spike clearly distinguishes:

- behavior inherited unchanged;
- behavior intentionally extended or replaced; and
- concerns deliberately outside the spike.

Classify findings:

- **Blocker** — implementation would require an unresolved product, scope,
  feasibility, or externally observable choice, or the authored brief conflicts
  materially with the supplied/inherited contract.
- **Material clarification** — the likely intent is apparent but different
  reasonable implementations remain possible.
- **Editorial** — wording could improve but does not block work.

Distinguish a missing contract decision from legitimate implementation freedom.
For every blocker or material clarification, cite the relevant brief/repository
evidence, explain the consequence, and request the smallest decision needed.

Do not create findings merely because more detail could be specified. The goal
is a fair contract, not exhaustive specification.

## Output

Write or replace only `<work-item>/brief-review.md` with:

- verdict;
- source/inherited-contract coverage where relevant;
- material findings and requested clarifications;
- brief strengths relevant to readiness;
- review limitations and repository evidence inspected.

End the file and user response with exactly one verdict:

- `READY`
- `READY WITH MINOR EDITS`
- `NOT READY`

Any blocker or material clarification makes the verdict `NOT READY`. `READY
WITH MINOR EDITS` is limited to editorial changes that do not alter the
contract.

Do not create history directories or workflow records. A material edit to
`brief.md` requires another readiness review.

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
