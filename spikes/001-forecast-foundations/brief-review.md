# Spike 001 — Brief Readiness Review

## Verdict

The revised brief is **not ready** for independent implementation and evaluation. The new marine boundary is correctly bounded, but it omits the observable response contract required when that independent source is absent or partially covered.

## Source and inherited-contract coverage

- The source assignment requires a Node.js GraphQL service using Open-Meteo to assess the next seven days. The spike deliberately and explicitly defers the final assessment methodology while retaining seven aligned `UNKNOWN` placeholders; that is an acceptable bounded foundation.
- The parent brief requires weather and marine data to degrade independently: usable ordinary weather must still produce a response if marine data is unavailable, and response metadata must make degraded data visible. It also requires coverage to be based on returned data rather than a requested horizon.
- The revised spike now carries those boundary requirements forward: it requires independent runtime validation and coverage calculation for ordinary forecast and marine responses, and says marine failure must not invalidate usable weather. The final observation set and activity methodology remain explicitly deferred to Spike 002.

## Material findings

### 1. Marine degradation is not given an observable GraphQL representation

The parent contract says degraded data must be visible in response metadata. The revised spike requires that a marine failure not invalidate usable weather, but its required GraphQL shape and acceptance criteria do not say what response state represents marine failure, partial marine coverage, or unavailable marine data. The existing GraphQL contract exposes only aggregate forecast coverage and `UNKNOWN` placeholders, so all of those marine states are currently indistinguishable to a caller.

That leaves independent implementations free to return a successful response silently, add incompatible metadata, or surface a GraphQL error while still arguing that weather data was fetched. None is a fair common contract.

**Requested clarification:** state the minimum public metadata for each source: ordinary-weather and marine availability/failure state and their actual covered dates (or an equivalently explicit representation). It need not prescribe the final SDL or activity scoring; it only needs to make a successful-but-degraded marine result distinguishable from fully available data.

## Strengths relevant to readiness

- The scope cleanly distinguishes application-owned lifecycle policy from deferred request-time persistence behavior.
- In-process same-location refresh coalescing remains explicit and bounded to one service instance.
- The requirement to validate provider data before application mapping is retained for both boundaries.
- The brief avoids inventing a premature activity data model: only enough observations to exercise boundary validation, coverage, timezone, nullability and failure behavior are required.

## Review limitations and evidence inspected

Reviewed `spikes/001-forecast-foundations/brief.md`, the supplied `source-brief.md`, inherited `brief.md`, `decisions.md`, repository instructions, and the current public/provider/service interfaces and focused tests under `src/` and `test/`. The implementation was inspected only as existing-contract evidence. Design maps, evaluation artifacts, implementation reports, and as-built artifacts were not consulted.

NOT READY
