# Product and Engineering Decisions

This is the working decision record for the take-home. It is not meant to restate the assignment. It records the places where the brief leaves room for interpretation, the choices I have made so far, and the things I am deliberately not fixing yet.

The employer brief remains the source requirement. This document is my interpretation of it and is intended to be the contract the implementation works against.

## 1. Location input means a city or town

The public input remains a city/town string. I am not expanding the product into arbitrary places, coordinates, beaches, surf breaks, resorts, mountains or parks.

The awkward part is that the geocoder's taxonomy does not map perfectly onto ordinary language. In particular, "suburb" is not a category I can reliably infer myself. Some places a user would think of as suburbs may be classified by the provider as an ordinary populated place and therefore pass the same allowlist as a town; others may be classified as a subdivision and be rejected.

I am therefore using an explicit allowlist of populated-place feature codes rather than trying to build my own city/town/suburb classifier. The current accepted set is:

- `PPL`
- `PPLA`
- `PPLA2`
- `PPLA3`
- `PPLA4`
- `PPLA5`
- `PPLC`
- `PPLG`

Broad sections/subdivisions such as `PPLX`, grouped places such as `PPLS`, historical/abandoned/destroyed populated-place codes, `STLMT`, and non-populated geographic features are not accepted.

This means a real-world suburb can sometimes be accepted and sometimes not, depending on how the provider classifies it. I am comfortable with that limitation for this exercise. What I do not want is a growing body of provider-specific inference rules whose purpose is to guess whether a result "really" counts as a town.

Search still needs to consider the user's full query. A qualified query such as `Muizenberg, Western Cape` should be searched as such rather than reducing it to the first word and hoping the top result is close enough.

Where qualifiers are supplied, they are authoritative. If the provider cannot resolve a result matching them, the request should fail rather than silently falling back to a different place. For an unqualified but ambiguous name, the first accepted provider result is used and the fully resolved geography is returned so the caller can see what was selected.

The resolved provider location, not the raw search string, becomes the location identity used by the rest of the service.

## 2. "Rank" means ordinal suitability, not a forced league table

I am interpreting ranking as a qualitative assessment of how suitable each day is for each activity.

The public result vocabulary is:

`UNKNOWN`, `UNSUITABLE`, `POOR`, `FAIR`, `GOOD`, `EXCELLENT`

`POOR` through `EXCELLENT` are ordered. Ties are allowed. There is no requirement to manufacture a unique first through seventh place, and I do not want to expose a 0-100 score that suggests more precision than the weather heuristics can support.

Internal numeric values are fine if they make a heuristic easier to implement, but they are an implementation detail rather than part of the API contract.

The activity ratings are meant to be useful on their own terms. They are not a claim that, for example, a `GOOD` surfing day is mathematically comparable to a `GOOD` indoor-sightseeing day.

`UNKNOWN` is not a weak form of `POOR`. It means the service does not have enough trustworthy information to make the assessment. `UNSUITABLE` is an actual conclusion from the information we do have.

The detailed methodology for turning forecast observations into these outcomes belongs to the activity-scoring spike and is deliberately not fixed here.

## 3. The seven-day window is seven complete destination-local days

"Next seven days" is interpreted as the seven complete calendar days after the resolved location's current local day.

Today is excluded.

If it is 6 September in the resolved destination, the requested dates are 7-13 September regardless of the caller's timezone or the server's timezone.

I chose complete days because daily and day-derived metrics become misleading when part of the period has already happened. Introducing an arbitrary rule such as "today counts if at least 16 hours remain" creates a precise-looking boundary with no real product meaning. Scoring only the remaining part of today would be legitimate, but it would require a separate partial-day methodology and materially increase the scope.

All date-window reasoning is therefore based on the destination's local calendar.

## 4. Initial GraphQL result shape

The exact SDL can still be refined during implementation, but the intended result shape is simple:

- response metadata;
- the resolved location;
- the seven target dates;
- one aligned array of outcomes for each of the four activities.

Conceptually:

```text
metadata
location
dates[7]
skiing[7]
surfing[7]
outdoorSightseeing[7]
indoorSightseeing[7]
```

The arrays are aligned by date rather than independently sorted.

For the forecast-foundation spike, the activity outcomes can all be `UNKNOWN`. That lets the first spike establish the location, time-window, provider and forecast lifecycle contracts without pretending the activity methodology has already been decided.

The second spike can replace those placeholders with the real heuristic while retaining the same broad response contract.

## 5. Forecast coverage matters more than a magic provider request size

The service needs enough provider data to cover seven complete future destination-local dates, and a persisted snapshot should remain reusable across its freshness window where possible.

A rolling request of `forecast_hours=195` is currently a useful Open-Meteo adapter strategy. It gives enough horizon for the remainder of the current local day, seven complete following days, and the current three-hour freshness window.

The important decision is that **195 is not an application invariant**.

Correctness is determined from the timestamps actually returned and the coverage recorded for the snapshot. A snapshot is reusable only when it is both fresh enough and covers the dates required by the current request.

In other words:

```text
usable = fresh && sufficient actual date coverage
```

If the freshness policy changes later, or the provider changes how a rolling request behaves, the application does not become wrong because some unrelated piece of code assumes that 195 has special meaning. At worst, a snapshot stops being reusable sooner and is refreshed.

The provider request strategy belongs inside the Open-Meteo adapter.

## 6. A "complete day" should be defined by usable local-date coverage, not exactly 24 records

I do not want to make "24 hourly timestamps" the structural definition of a valid day. That would turn daylight-saving transitions into false failures and would also make a single missing timestep automatically invalidate a day even where the eventual heuristic does not need that exact observation.

The useful invariant is that the service has sufficient meaningful observations for the local calendar day to evaluate the behaviour that depends on them.

The precise completeness rule is intentionally not being over-specified in the foundation spike because it depends partly on the activity heuristic. A DST day with 23 or 25 local hours should not be rejected merely because it is not 24 hours long.

Likewise, missing data should not be silently treated as a real weather value. Where required observations are absent, the affected assessment should degrade to `UNKNOWN` rather than inventing confidence.

The exact per-activity minimum data requirement belongs with the heuristic that consumes the data.

## 7. Partial provider coverage is best-effort, not all-or-nothing

Weather and marine data do not have identical availability and should not be made into one request-level success condition.

If ordinary weather data is usable but marine data is unavailable, the service can still assess the activities that depend only on weather. Surfing should become `UNKNOWN` for the unsupported dates rather than causing the entire request to fail.

The same principle applies to partial date coverage: return the outcomes that can be supported and represent unsupported conclusions honestly rather than treating the whole seven-day request as unusable.

This is deliberately best-effort behaviour, but not silent best effort. Response metadata should make stale or degraded data visible.

## 8. Stale data may be used as a bounded fallback

Fresh data is preferred. The normal freshness policy is currently three hours.

If a refresh fails and there is a previously persisted snapshot that is no more than 24 hours old, the service may use it as a stale fallback rather than fail the request immediately.

The stale snapshot still has to be judged against its real coverage. We should not claim a date is covered merely because the snapshot is recent.

If the stale snapshot can support only part of the requested window, the response should be best effort rather than pretending the missing part is current data. The exact GraphQL representation of an uncovered target date can be settled alongside the final response schema, but unsupported activity/date results should remain explicit rather than fabricated.

Data older than the fallback limit is not considered usable merely because it exists in storage.

## 9. Refresh is lazy and duplicate refreshes are coalesced in-process

There is no scheduled forecast refresh job for this exercise.

On request:

```text
resolve location
load snapshot
use it if fresh and sufficiently covered
otherwise refresh and persist
```

If several requests for the same resolved location arrive while a refresh is already in flight, they should await the same refresh rather than independently hammering Open-Meteo.

For this take-home I am assuming a single service instance. In-process single-flight/coalescing is therefore enough. Distributed locking or cross-instance refresh coordination would solve a deployment problem I am not claiming to solve here.

## 10. Snapshot retention and cleanup are deferred

The service needs persisted forecasts to survive process restarts and support reuse/fallback. It does not currently need a historical weather archive.

A retention/cleanup policy will eventually be necessary if this runs for a long time, but defining compaction, history retention or scheduled cleanup is not useful to the take-home and is deferred.

## 11. Persistence lifecycle is decided before persistence payload

I initially planned persistence as part of the forecast-foundation slice. I deferred the final persisted forecast shape because it depends on which temporal observations the activity methodology actually requires. Spike 1 establishes snapshot identity, freshness and coverage semantics; Spike 2 will define the forecast data model before persistence is committed.

There are persistence semantics I can decide without knowing the activity methodology:

- a snapshot belongs to a canonical resolved location;
- it records when it was fetched;
- it records the coverage it actually contains;
- freshness and coverage determine normal reuse;
- a bounded stale fallback may be used after refresh failure;
- snapshots survive a service restart.

What I do **not** want to decide in the forecast-foundation spike is the final persisted forecast payload.

The activity heuristic may need daily aggregates, hourly observations, correlations between values at the same time, or some mixture of these. Choosing a heavily reduced schema before that methodology exists would make the database design dictate the product model.

The dependency I want is:

```text
activity semantics
    -> required forecast observations
    -> application forecast model
    -> persisted representation
```

rather than designing a persistence schema first and then forcing the heuristic to fit it.

The final payload shape is therefore deferred until the activity-scoring spike. This is a deliberate sequencing decision, not a decision to defer persistence itself.

## 12. Open-Meteo is an external boundary, not the application data model

Provider JSON should not leak through the service.

HTTP response bodies are treated as `unknown`, validated at runtime at the provider boundary, and then mapped into application-owned types. TypeScript alone cannot establish that an external response actually has the shape the code expects.

The intended flow is:

```text
Open-Meteo JSON
    -> runtime validation
    -> provider-specific DTO
    -> mapper
    -> application-owned forecast data
```

Zod is the current choice for runtime validation because it is small, familiar and makes the boundary explicit. The important decision is runtime validation and translation at the external boundary, not Zod as a product dependency in its own right.

I am not introducing a generic weather-provider abstraction. There is one known provider in the brief. A provider-specific client and mapper isolate the real source of volatility without inventing a framework for providers that do not exist.

## 13. Activity availability is outside the weather claim

The service ranks forecast suitability at the resolved location. It does not claim that the activity itself exists there.

Open-Meteo cannot tell us whether a ski resort exists, whether lifts are operating, whether a particular beach has a surfable break, or whether a museum is open. Adding those claims would require other datasets and a materially different product.

That means the language and heuristics need to stay within what the available data can support.

For surfing, marine data is based on the provider's marine forecast associated with the resolved location and should be treated as a coarse location-level proxy. A city such as Cape Town is not a single surf break.

For skiing in particular, the scoring methodology needs to avoid implying availability merely because skiing appears in the assignment. The exact weather-only rule is deliberately left to the activity-methodology spike.

## 14. Deliberate scope boundaries

For this take-home I am intentionally not solving:

- arbitrary geographic features or coordinates as input;
- surf-break selection;
- resort discovery or lift availability;
- attraction discovery/opening hours;
- user skill or preference profiles;
- distributed refresh coordination;
- model-aware provider refresh schedules;
- long-term forecast history and analytics;
- a general multi-provider weather framework;
- partial-current-day scoring.

These are real product or production concerns, but none of them needs to be solved to demonstrate the behaviour the brief asks for.

## 15. Deferred decisions

The main decisions still intentionally deferred to the activity-scoring spike are:

- the exact skiing, surfing, outdoor-sightseeing and indoor-sightseeing heuristics;
- which raw/hourly/daily observations those heuristics actually require;
- the final persisted forecast payload derived from those needs;
- exact per-activity rules for whether partial/missing observations are sufficient or require `UNKNOWN`;
- the final GraphQL SDL and detailed metadata fields;
- snapshot cleanup/retention policy beyond the fact that it is not required for the take-home.

Those should be settled when there is enough product information to make them real decisions rather than guesses.
