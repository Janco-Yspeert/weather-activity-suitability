# Spike 002 — Brief Readiness Review

## Verdict

The Spike 002 brief and human-accepted calibration amendment are ready to
govern renewed independent design, implementation and evaluation.

The amendment resolves the prior sufficiency ambiguity without changing the
higher-level activity semantics. Missing timestamps no longer shrink the
expected activity period, while a fully observed minimum surf or ski
opportunity may still support a conservatively capped positive result below
70% whole-period coverage.

One stale introductory sentence in `calibration.md` should be corrected, but it
does not leave behavioral implementation or evaluation choices unresolved.

## Source and inherited-contract coverage

- The source assignment's city/town input, Open-Meteo-backed seven-day
  activity assessment, Node.js/GraphQL constraints and eventual persistence
  requirement remain covered. Durable persistence and request-time reuse stay
  explicitly deferred beyond Spike 002.
- The inherited public ratings, canonical location identity,
  destination-local dates, independent weather/marine acquisition, source
  metadata, provider validation and refresh coalescing remain unchanged.
- Source coverage remains distinct from activity sufficiency. Expected surf
  and ski slots are now derived from their destination-local activity periods,
  independently of returned records.
- The amendment is confined to surfing and skiing. Outdoor and indoor
  sightseeing semantics are unchanged.

## Material findings

No blockers or material clarifications remain.

The revised surf contract distinguishes >=70% ordinary period aggregation from
a below-threshold fallback based only on the best fully observed two-hour-or-
longer opportunity. The fallback cannot use missing periods or a second
opportunity, cannot infer an ordinary negative result from sparse evidence, and
cannot exceed `GOOD`.

The revised ski contract likewise distinguishes >=70% ordinary aggregation
from a below-threshold fallback based on one complete four-hour usable block.
Its block-local snow rules are now total and unambiguous:

- `<0.01 m` or `0.01–<0.05 m` cannot establish a positive fallback and yield
  `UNKNOWN` under partial evidence;
- `<0.01 m` becomes `UNSUITABLE` only when the independent 70% snow-depth
  evidence threshold is met;
- `0.05–<0.15 m` caps the fallback at `FAIR`;
- `0.15–<0.30 m` caps it at `GOOD`; and
- `>=0.30 m` remains subject to the general partial-evidence `GOOD` maximum.

The accompanying scenarios fix the expected outcomes for each boundary, so an
implementer or evaluator need not invent missing snow semantics.

## Minor editorial edit

The calibration status and amendment-record heading say the sufficiency
amendment is human accepted, but the introductory paragraph still calls it a
“proposed amendment” whose exact text “remains subject to human confirmation.”
Update that paragraph to past tense and remove the obsolete confirmation
sentence. This does not alter the accepted behavioral contract.

## Strengths relevant to readiness

- Period sufficiency and opportunity sufficiency are explicit and
  activity-specific rather than hidden inside a universal coverage algorithm.
- Missing timestamps cannot reduce denominators, bridge gaps, manufacture
  opportunities or contribute positive utility.
- Positive existence claims and negative absence claims now require
  appropriately different evidence without converting missing data into good
  weather.
- Global extremes, structural marine non-applicability and independently
  sufficient no-snow evidence retain clear precedence.
- Partial-evidence results exclude whole-day and multi-opportunity bonuses, and
  wider-day ski modifiers are not applied to incomplete periods.
- The amendment preserves the brief's weather-only scope and does not smuggle
  in changes to outdoor or indoor sightseeing.

## Review limitations and evidence inspected

Reviewed `AGENTS.md`, `source-brief.md`, root `brief.md`, the relevant activity
and evidence decisions in `decisions.md`, accepted Spike 001 `as-built.md`, the
complete Spike 002 `brief.md`, the updated human-accepted `calibration.md`, and
`WORKLOG.md`.

In accordance with the brief-readiness boundary, this review did not inspect
the Spike 002 Design Map, evaluator artifacts, implementation report,
candidate scoring code or developer tests. It does not judge the current
candidate against the amended contract.

READY WITH MINOR EDITS
