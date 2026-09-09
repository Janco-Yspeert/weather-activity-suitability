# Product Brief

## Purpose

Build a backend service that accepts a city or town and returns a seven-day weather-suitability assessment for:

- Skiing
- Surfing
- Outdoor sightseeing
- Indoor sightseeing

The service uses Open-Meteo for forecast data and persists forecast snapshots so that it does not call the provider on every request.

This brief is my interpretation of the supplied take-home brief. The original brief remains the source requirement; this document resolves the product ambiguities that need to be fixed before implementation.

## Product interpretation

### Location input

The public input is a city or town name.

The service is not intended to accept arbitrary coordinates, beaches, surf breaks, ski resorts, mountains, parks or other named geographic features.

Location resolution is provider-backed. Only populated-place result types that can reasonably be defended as a city or town are accepted. Suburbs are not explicitly supported as a separate product category. In practice, some places a user thinks of as suburbs may still be accepted if the provider classifies them as an ordinary populated place, while others may not be.

Qualified searches such as `Cambridge, Massachusetts` or `Muizenberg, Western Cape` should be resolved using the full query. Where qualifiers are supplied, they are treated as part of the requested identity rather than as hints that may be silently ignored.

For an unqualified ambiguous name, the service may use the first acceptable provider result. The resolved place is returned in the response so that the caller can see which location was used.

The resolved provider location, rather than the raw search string, is the canonical identity used for forecast reuse.

### Seven-day window

"Next seven days" means the seven complete calendar days following the resolved location's current local day.

The current day is excluded.

For example, if the destination-local date is 6 September, the response covers 7-13 September even if the caller or server is in another timezone.

This avoids mixing full-day assessments with partial-day assessments. A partial current day would require different semantics because some of its weather has already happened.

### Ranking semantics

"Rank" is interpreted as an ordinal suitability assessment for each activity on each day, not as a forced first-to-seventh ordering.

The public rating values are:

- `UNKNOWN`
- `UNSUITABLE`
- `POOR`
- `FAIR`
- `GOOD`
- `EXCELLENT`

`POOR` through `EXCELLENT` are ordered suitability levels. Ties are valid.

The API does not expose a 0-100 score. Internal numeric calculations may be used if helpful, but they are not part of the product contract.

The ratings are activity-specific. A `GOOD` surfing day and a `GOOD` indoor-sightseeing day do not imply a mathematically comparable score.

### Meaning of UNKNOWN and UNSUITABLE

`UNKNOWN` means the service does not have enough trustworthy evidence to make the assessment.

`UNSUITABLE` is an affirmative conclusion based on the information available.

Missing or failed provider data must not be converted into `UNSUITABLE` merely because the service cannot assess the activity.

The detailed evidence and thresholds required for each activity are deliberately deferred to the activity-methodology spike.

### Weather suitability, not activity availability

The service assesses weather suitability at the resolved location.

It does not claim that the activity itself is available there.

Open-Meteo cannot establish whether a ski resort exists, whether lifts are operating, whether a particular beach has a usable surf break, or whether local attractions are open. Those questions require other datasets and are outside the scope of this exercise.

Surfing is therefore a coarse location-level marine assessment rather than a surf-break recommendation. Skiing is a weather-suitability assessment only; its methodology must not imply resort or infrastructure availability.

## Activity methodology

The detailed activity-rating methodology is intentionally deferred from the
initial project brief.

This brief defines the public meaning of the ratings and the constraints that
the methodology must preserve, but does not yet define the exact forecast
signals, aggregation rules, thresholds, or worked examples for each activity.

Spike 2 will produce that methodology before activity-rating implementation
begins.

The methodology must define, for each activity:

- the forecast observations used;
- any prerequisite or hard-gate conditions;
- the mapping from observations to public rating values;
- missing-data behaviour;
- representative and boundary examples.

Once agreed, the methodology becomes part of the governing product contract.
`brief.md` must be updated to reference or incorporate it before Spike 2
implementation proceeds.

Until that refinement exists, the service is not considered complete against
the source brief.

## Forecast lifecycle

### Persistence and reuse

Forecast data must survive process restart and be reused where possible rather than fetched on every request.

A persisted snapshot is associated with a canonical resolved location and records enough metadata to determine:

- when it was fetched;
- the complete destination-local target window it was requested to support;
- which destination-local dates it actually covers;
- whether it is fresh enough for normal reuse;
- whether it is still eligible as a stale fallback.

The requested target window and actual returned coverage are separate concepts.
The former determines whether a snapshot is compatible with the current request;
the latter determines what evidence the service can actually use.

The final persisted forecast payload is intentionally not fixed in this brief. The activity methodology may require hourly observations, daily aggregates, correlated observations, or some combination of these. The persisted representation should follow those requirements rather than constrain them in advance.

### Freshness and request-window compatibility

The normal forecast freshness window is three hours.

Normal reuse requires a successfully fetched and validated snapshot that is
both fresh and compatible with the current seven-day target window.

```text
normal reuse =
    successful snapshot
    && fresh
    && request-window compatible
```

A snapshot is request-window compatible when its recorded
requestedThroughDate is on or after the final complete destination-local
target date required by the current request.

`requestedThroughDate` represents the last complete destination-local day that
the provider request was intended to support across its required source inputs.

For the normal seven-day product window this is at least the seventh target
date. A provider may record a later date when its request shape intentionally
covers an additional complete day, for example to preserve freshness across a
local-midnight rollover.

It is not inferred from actual returned coverage or the final timestamp
returned by the provider.

Actual returned coverage remains separate from refresh eligibility. A
successfully validated partial or no-data response is reused for the normal
freshness window when it is request-window compatible. Its actual evidence
continues to determine source metadata and activity-specific sufficiency.

This prevents repeated requests to a degraded provider while also ensuring that
a fresh snapshot is refreshed when the destination-local date advances beyond
the horizon it was fetched to support.

### Refresh behavior

Refresh is lazy.

When a request arrives, the service should:

1. resolve the location;
2. load the latest persisted source snapshots;
3. reuse a source snapshot if it is fresh and request-window compatible;
4. otherwise refresh that source from Open-Meteo and persist a successful response;
5. use actual returned coverage and activity-specific evidence rules to
   determine which assessments the selected source can support.

A scheduled background downloader is not required.

Concurrent refreshes for the same resolved location should be coalesced in-process so that one stale location does not result in several identical provider requests.

For this take-home, a single service instance is assumed. Cross-instance refresh coordination is out of scope.

### Stale fallback

If a refresh fails, a previously persisted snapshot may be used as a stale fallback if it is no more than 24 hours old.

The stale snapshot must still be assessed against its real coverage. Being recent enough does not make it valid for dates it does not contain.

Fallback should be visible in response metadata rather than silently presented as fresh data.

## Partial data and degradation

Weather and marine data are independent enough that failure of one should not automatically invalidate everything else.

If ordinary weather data is usable but marine data is not, the service should still return the assessments it can support. Surfing should become `UNKNOWN` for unsupported dates rather than causing the entire request to fail.

The same principle applies to partial date coverage. The service should return supported results and represent unsupported conclusions honestly.

The exact minimum-data rule for each activity is part of the activity methodology and is intentionally deferred. A calendar day must not be considered incomplete merely because it contains something other than exactly 24 hourly records; destination daylight-saving transitions can legitimately produce 23- or 25-hour local days.

## GraphQL response

The final SDL can be refined during implementation, but the response should expose:

- response metadata;
- the resolved location;
- the seven target dates;
- one rating per activity for each target date.

Results remain aligned to the dates in chronological order. They are not independently sorted into league tables.

The response metadata should be sufficient to make degraded or stale data visible.

## Technical constraints

The service must be implemented in TypeScript. TypeScript is specified in the accompanying email rather than the brief itself.

The supplied brief also requires Node.js and GraphQL.

The implementation will target Node.js 24 LTS using ESM and npm.

External Open-Meteo responses will be runtime-validated at the provider boundary before being mapped into application-owned types.

The persistence technology and final forecast storage model are deliberately deferred until the activity methodology establishes what forecast observations need to be retained.

## Deferred activity methodology

This brief defines what the public ratings mean, but deliberately does not define the exact weather variables, aggregations or thresholds used to derive them.

Those decisions belong to the activity-methodology spike.

That spike will determine, for each activity:

- which forecast evidence is relevant;
- any prerequisite or hard-gate conditions;
- rating boundaries;
- missing-data behavior;
- worked examples and boundary cases;
- which forecast observations must therefore be retained and persisted.

This sequencing is deliberate. The product meaning is fixed first; the detailed heuristic and persistent payload are defined only once there is enough information to make those choices responsibly.

The v1 activity methodology is defined by `spikes/002-activity-scoring/brief.md`. Its accepted calibration contract is `spikes/002-activity-scoring/calibration.md`, which fixes the
executable v1 scoring values and boundary scenarios.

## Submission and delivery

The completed work will be submitted as a public GitHub repository.

The repository must make the working process visible, including consequential
decisions, changes of direction, use of AI, and deliberate omissions or
deferrals.

The final repository must include a short `README.md` covering:

- what was built;
- how to install and run it;
- how to run the relevant checks/tests;
- key assumptions and deliberate limitations.

The completed service must be runnable from documented repository commands.

### README ownership

`README.md` is reserved for the final documentation phase.

AI implementation, design, evaluation and as-built agents must not create,
rewrite, expand or otherwise modify `README.md` unless explicitly instructed
to do so during the final documentation pass.

During implementation, record information that may eventually belong in the
README in the relevant spike artifacts or `WORKLOG.md` instead.

## Non-goals

The take-home does not attempt to solve:

- arbitrary geographic input;
- surf-break discovery or ranking;
- ski-resort discovery, snowpack verification or lift availability;
- attraction discovery or opening hours;
- user skill levels or personal weather preferences;
- partial-current-day scoring;
- distributed refresh coordination;
- long-term forecast history and analytics;
- model-aware refresh scheduling;
- a generic multi-provider weather framework.

These may be valid production concerns, but they are outside the scope of the requested service.
