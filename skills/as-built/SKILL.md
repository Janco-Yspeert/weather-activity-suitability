---
name: as-built
description: Reconstruct the material behavior and structure actually present after independent verification, compare reality with the brief and Design Map, and make incremental-spike drift visible without becoming another code review.
---

# As-Built

Answer one question: **what did we actually build, and where does it differ from
the agreed contract?**

## Input

Argument: `<work-item-directory>`.

Required:

- `<work-item>/brief.md`
- `<work-item>/design-map.md`
- `<work-item>/implementation-report.md`
- `<work-item>/evaluation-result.md` with verdict `PASS`
- the current accepted candidate, relevant surrounding code, and visible tests

Read inherited accepted/as-built behavior when the current spike explicitly
extends or changes it.

Use fresh context where practical. Git history is not required; inspect the
candidate as it exists.

## Inspection

Reconstruct facts about observable behavior, lifecycle, ownership, persistence,
invariants, coupling, side effects, assumptions, and significant architecture.

For incremental spikes, state the cumulative effect relevant to the current
contract: what was inherited, what changed, and whether the new candidate still
matches the promised integration behavior.

Compare reality with the brief and Design Map using only:

- **Missing** — required behavior or shared structure is absent.
- **Contradictory** — reality conflicts with the agreed contract.
- **Extra** — material behavior or structure exists beyond the contract.

Do not rerun evaluation, perform a general code-quality review, invent
requirements, or recommend refactors. If there is no drift, say so directly.

## Output

Write or replace only `<work-item>/as-built.md` with:

- status: `ALIGNED`, `DRIFT FOUND`, or `BLOCKED`;
- concise implemented shape;
- observable behavior and important structural facts;
- inherited/changed behavior where relevant;
- assumptions, limitations, and deliberate omissions that are factual features
  of the implementation;
- `Missing`, `Contradictory`, and `Extra` findings, omitting empty categories.

A material discrepancy requires human disposition before the work item is
considered closed.

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
