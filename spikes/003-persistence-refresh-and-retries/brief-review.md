# Spike 003 — Brief Readiness Review

## Verdict

The inherited lifecycle contract now agrees with Spike 003's refinement. The
brief is sufficient to govern independent Design Map, implementation, and
evaluation work; one historical wording cleanup would make it less confusing
for a future reader but does not alter the contract.

## Source and inherited-contract coverage

- The source assignment requires a Node.js/GraphQL backend that persists
  Open-Meteo data rather than calling the provider on every request. The brief
  makes SQLite-backed persistence, restart reuse, and an HTTP-served GraphQL
  service explicit.
- The root brief now defines normal reuse as a successfully validated, fresh,
  request-window-compatible snapshot, and explicitly separates actual coverage
  from refresh eligibility. `decisions.md` section 5 states the same rule.
  This matches Spike 003 sections 2 and 8.1, including reuse of fresh partial
  and no-data snapshots.
- Spike 001's location, destination-local date window, source-state, provider
  boundary, and in-process coalescing contracts are preserved. Spike 002's
  accepted scoring, calibration, evidence-sufficiency, and advisory semantics
  are inherited unchanged; Spike 003 only changes how application-owned source
  forecasts reach that scorer.
- The spike clearly adds the remaining lifecycle behavior: independent weather
  and marine storage/refresh/fallback, exact retry and timeout policy, stale
  metadata, persistence failure behavior, restart behavior, and runnable
  GraphQL transport. Its non-goals exclude the usual cache-distributed-systems
  summoning ritual.

## Material findings and requested clarifications

None. The prior parent-contract conflict is resolved. The refresh, stale
fallback, retry, metadata, concurrency, and failure semantics are specific
enough for fair independent implementation and evaluation.

## Editorial note

Spike 003 section 2 still says the root documents "currently" contain the old
coverage-gated reuse rule and labels their update as required cleanup. Those
documents have now been aligned. Updating that wording to describe the
refinement as completed would avoid historical confusion, but it is not needed
to determine behavior and does not require another readiness review.

## Strengths relevant to readiness

- Freshness, requested horizon, source coverage, and activity-data sufficiency
  are explicitly distinct, preventing a partial provider response from causing
  either fake evidence or a refresh stampede.
- Exact 3-hour/24-hour boundary conditions, retry classes and limits,
  per-source independence, and public stale semantics make lifecycle behavior
  directly testable.
- Persistence is deliberately downstream of provider validation and persists
  application-owned forecasts rather than raw provider JSON or derived public
  ratings.
- The acceptance criteria cover deterministic restart, failure, coalescing,
  metadata, runtime, and regression behavior without making live-network
  flakiness an oracle.

## Review limitations and repository evidence inspected

Inspected Spike 003's authored brief; the supplied assignment; the updated root
product brief and decisions; Spike 001 and Spike 002 briefs; the accepted Spike
002 calibration and advisory amendment; current forecast policy, service,
GraphQL, package, and focused lifecycle/service tests; and `WORKFLOW.md`. Per
the readiness boundary, this review did not read Spike 003 Design Map,
evaluator, implementation, or as-built artifacts, and did not design or
implement the service.

READY WITH MINOR EDITS
