# Spike 002 — Brief Readiness Review

## Verdict

The brief, accepted calibration contract, and inherited product contract are
ready to govern independent Design Map, implementation, and evaluation of
Spike 002.

## Source and inherited-contract coverage

- The source assignment's city/town input, Open-Meteo-backed seven-day
  activity assessment, Node.js/GraphQL constraints, and eventual persistence
  requirement remain covered. Durable snapshots and request-time reuse remain
  explicitly deferred to Spike 003.
- The inherited public rating meanings, canonical location identity,
  destination-local date window, independent weather/marine acquisition,
  source-state metadata, provider validation, observation-selection boundary,
  refresh coalescing, and date-aligned GraphQL response remain intact.
- Spike 002 clearly extends the inherited placeholder ratings with an
  application-owned aligned forecast, global severe-weather override,
  activity-specific synthesis, weather-only scope, and internal reasons needed
  for indoor sightseeing. It keeps persistence, break/resort availability,
  official warnings, and partial-current-day scoring outside scope.
- The calibration-authoring phase now correctly identifies the remaining
  rating-affecting choices, constrains them to the fixed semantics and
  representative scenarios, requires human acceptance, freezes the resulting
  `calibration.md`, and requires root-brief integration before downstream work.

## Material findings

No blockers or material clarifications were identified.

## Strengths relevant to readiness

- Calibration authority is now clear: the calibration phase authors the values,
  and Design Map, implementation, and evaluator consume the accepted frozen
  artifact.
- `calibration.md` is unambiguously marked `ACCEPTED`, and root `brief.md`
  references it as the accepted v1 calibration contract before downstream work.
- The outdoor fallback rows and skiing's no-usable-but-scorable-`POOR` row now
  make their daily aggregation total rather than leaving implementation to
  invent a category.
- The brief still distinguishes lack of evidence from affirmative
  unsuitability, avoids a fixed 24-hour day assumption, and preserves the
  successful-all-null marine distinction needed for structural surf
  non-applicability.
- The activity and safety boundaries remain appropriately narrow; no one is
  attempting to derive avalanche warnings from a weather-code horoscope.

## Review limitations and repository evidence inspected

Reviewed `AGENTS.md`, `skills/brief-readiness/SKILL.md`, the revised
`spikes/002-activity-scoring/brief.md`, its explicitly referenced accepted
`calibration.md`, `source-brief.md`, inherited `brief.md`, `decisions.md`,
Spike 001's authored brief, and the current provider, service, GraphQL, policy
interfaces and focused tests. I did not consult the current Spike 002 Design
Map, evaluation artifacts, implementation reports, human-review artifacts, or
other later workflow outputs.

READY
