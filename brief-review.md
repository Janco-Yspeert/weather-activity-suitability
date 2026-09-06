# Brief Readiness Review

## Verdict

The brief is not yet ready to govern independent implementation and evaluation of the complete service.

## Source and Repository Coverage

The review compared `brief.md` with `source-brief.md`. The authored brief preserves and clarifies the service purpose, the four activities, city-or-town input, Open-Meteo as the data provider, persistence, Node.js, and GraphQL. It also records additional product decisions about destination-local dates, forecast reuse, stale fallback, partial-data handling, and runtime validation at the provider boundary.

The repository currently contains only the TypeScript and test-tooling baseline and a smoke test. It provides no inherited service behavior or public API that constrains this review.

## Material Findings

### Blocker: Activity ratings cannot be implemented or evaluated

`source-brief.md` requires the service to rank each of the next seven days for skiing, surfing, outdoor sightseeing, and indoor sightseeing. `brief.md` defines the rating vocabulary but explicitly defers the evidence, hard gates, rating boundaries, missing-data rules, and worked examples for every activity to a future activity-methodology spike.

This leaves no basis to determine whether a particular forecast should yield `UNSUITABLE`, `POOR`, `FAIR`, `GOOD`, or `EXCELLENT`, or when an otherwise available observation set should yield `UNKNOWN`. An implementation could return `UNKNOWN` for every activity and satisfy the stated deferred rules while failing the source requirement to provide useful rankings.

Requested clarification: provide the activity methodology as part of this work item, or explicitly scope this brief to a forecast-foundation increment whose required response values are `UNKNOWN` and provide the later methodology work item that completes the source requirement.

### Blocker: Submission requirements are not incorporated into the authored contract

`source-brief.md` requires a public GitHub repository, visible evidence of the working process, and a short README covering what was built, how to run it, and assumptions. `brief.md` says the source brief remains authoritative but does not explicitly retain these delivery requirements or define how the completed service must be runnable.

These requirements materially affect the final repository and evaluation, even though they do not change the runtime service behavior.

Requested clarification: add an explicit delivery section that retains the public repository, transparent process record, and README requirements, including the expected runnable entry point or command.

## Strengths Relevant to Readiness

- The service boundary is clear: assess weather suitability at a city or town, rather than activity availability or arbitrary geographic features.
- The seven-day window is deterministic and uses the resolved location's local calendar, excluding the partial current day.
- The rating vocabulary distinguishes absence of trustworthy evidence from an affirmative unsuitable conclusion.
- Snapshot identity, freshness, coverage, lazy refresh, in-process refresh coalescing, and stale-fallback limits are specified clearly enough to guide a later forecast implementation.
- The brief correctly prevents missing weather or marine data from being represented as an unsuitable result.

## Review Limitations and Evidence Inspected

Inspected `brief.md`, `source-brief.md`, `README.md`, the current TypeScript/Vitest baseline, and `WORKLOG.md`. No inherited implementation, public GraphQL schema, design map, evaluation plan, evaluation artifacts, or implementation reports were reviewed.

NOT READY
