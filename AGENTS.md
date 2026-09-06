# AGENTS.md

This repository uses a lightweight staged workflow for the take-home.

The source requirement is in `source-brief.md`.

The current project interpretation is in `brief.md`.

Before making consequential product or architectural decisions, read the
relevant brief/artifacts rather than inferring intent from the implementation.

## Workflow

`WORKFLOW.md` describes the available Harness-lite phases and how they fit
together.

Skills live under `skills/`.

Typical phases are:

- `brief-readiness`
- `design-map`
- `implementation`
- `evaluator`
- `as-built`

These may be run individually. Do not assume you should automatically continue
through every phase unless the current task explicitly asks for that.

## Working rules

- Keep changes within the scope of the current task or spike.
- Do not invent product requirements that are not supported by the governing
  brief or an accepted refinement.
- Prefer small, explicit decisions over speculative framework-building.
- Preserve external-provider uncertainty at the boundary rather than hiding it
  behind assumptions.
- Where behaviour is understood, prefer focused test-first implementation.
- Where external behaviour is genuinely unknown, do bounded discovery first,
  then return to test-driven implementation once the boundary is understood.
- Record consequential decisions, discoveries, deferrals, and phase outcomes in
  `WORKLOG.md`.
- Do not rewrite or tidy previous worklog entries.

## README

`README.md` is reserved for the final documentation pass.

Do not create, expand, rewrite, or otherwise modify `README.md` unless the
current task explicitly asks for final README work.

During implementation, record information that may later belong in the README
in the relevant spike artifacts or `WORKLOG.md`.

## Evaluation

Evaluator findings are evidence, not automatic authority.

If a failing check appears to conflict with the governing brief, validate the
oracle before changing the product behaviour.

Classify material failures as one of:

- product defect
- evaluator defect
- environment/tooling issue
- specification ambiguity

## Scope

The repository may contain future or deferred work.

Do not implement deferred behaviour merely because it is mentioned in the root
brief. Follow the scope of the current spike or task.
