# Spike 003 — Persistence, Refresh Lifecycle, Retries and Runnable Service

Status: DRAFT FOR HUMAN REVIEW

Depends on:

- `../../source-brief.md`
- `../../brief.md`
- `../../decisions.md`
- `../001-forecast-foundations/brief.md`
- `../002-activity-scoring/brief.md`
- `../002-activity-scoring/calibration.md`
- the accepted Spike 002 advisory amendment

## 1. Purpose

This is the final implementation spike for the backend service.

Spike 001 established the provider, geocoding, destination-local date, source
coverage and refresh-coalescing foundations. Spike 002 established the
application-owned weather/marine observations, activity scoring, evidence
sufficiency and public advisory semantics.

This spike completes the lifecycle that the source brief explicitly asks the
candidate to design:

> Persist Open-Meteo data rather than calling the API on every request. How the
> data is modelled, stored and refreshed is part of the problem.

The goals of Spike 003 are therefore to:

1. persist resolved locations and forecast source snapshots in SQLite;
2. reuse persisted data across requests and process restarts;
3. keep weather and marine refresh/fallback lifecycles independent;
4. implement the accepted three-hour freshness and 24-hour stale-fallback rules;
5. cache successfully validated partial provider responses rather than
   repeatedly hammering a degraded provider;
6. add bounded timeout and retry behaviour around Open-Meteo network requests;
7. preserve in-process refresh coalescing;
8. expose stale-source use clearly in GraphQL metadata; and
9. make the completed GraphQL backend runnable through a documented server
   command.

This spike must not change the accepted activity-scoring calibration or the
meaning of existing ratings/advisories except where integration requires
passing persisted source data into the existing scorer.

---

## 2. Governing lifecycle refinement

The root brief currently contains older wording that says a snapshot is
normally reusable only when it is both fresh and sufficiently covered.

The human decision for this spike refines that rule.

A successfully fetched and runtime-validated source response is reusable for
the normal freshness window even when its actual coverage is partial or
contains no usable values.

Coverage still matters. It determines source metadata and, more importantly,
whether each activity has enough evidence to produce a rating. Freshness must
never manufacture missing evidence.

The refined rule is:

```text
fresh successfully validated source snapshot
    -> reuse for three hours
    -> score only what its actual evidence supports
```

not:

```text
partial source snapshot
    -> immediately refetch on every request until complete
```

The reason is operational as well as semantic. Open-Meteo may successfully
return partial data. Repeatedly refreshing a valid partial response would turn
provider degradation into self-inflicted request amplification without
creating any additional trustworthy evidence.

A production system could choose a shorter refresh interval for partial data.
That is deliberately deferred. In this take-home, complete, partial and
successfully validated no-data responses use the same three-hour freshness
window.

### Required governing-document cleanup

Before downstream implementation/evaluation treats this spike as authoritative,
update the corresponding old statements in `../../brief.md` and
`../../decisions.md` so that they do not still require
`fresh && sufficient coverage` for reuse.

The root brief should continue to say that coverage governs what can be
supported, but freshness and coverage are separate lifecycle concepts.

---

## 3. Persistence technology

Use SQLite.

SQLite is chosen because the exercise requires persistence across process
restart but does not require distributed storage or deployment infrastructure.

For this take-home SQLite provides:

- real durability;
- zero external service setup;
- straightforward deterministic tests;
- simple inspection during review;
- enough transactional behaviour for canonical locations and aliases; and
- an intentionally small operational footprint.

Do not introduce an ORM or generic repository framework merely to abstract one
SQLite implementation.

The exact SQLite driver may be chosen during the Design Map/implementation
phase. The target remains Node.js 24.

The database file location should be configurable so tests can use isolated
temporary databases and normal runtime can use a local file.

---

## 4. What is persisted

Persist application-owned data, not raw Open-Meteo response JSON.

The existing Open-Meteo boundary remains:

```text
Open-Meteo JSON
    -> runtime validation
    -> provider mapping
    -> application-owned ResolvedLocation / SourceForecast
```

Persistence occurs after that boundary.

The database must not become another place where provider field names such as
`temperature_2m` or `swell_wave_period` leak into the application.

### Do persist

- canonical resolved location details;
- normalized successful query aliases pointing to canonical locations;
- weather source snapshots;
- marine source snapshots;
- source type;
- successful fetch timestamp;
- enough persisted source payload to reconstruct the complete application-owned
  source forecast required by scoring, including weather solar-day data.

### Do not persist

- raw provider JSON;
- precomputed public activity ratings;
- precomputed advisories;
- Open-Meteo-specific response DTOs;
- a generic multi-provider representation;
- long-term analytics aggregates.

Ratings and advisories are recomputed from the selected persisted source
snapshots on each assessment. This avoids persisting derived behaviour that
could become inconsistent with the current scoring implementation.

---

## 5. Persistence shape

The exact SQL DDL belongs to the Design Map, but the durable model should remain
close to these concepts.

### 5.1 Canonical locations

A canonical location stores the currently accepted `ResolvedLocation` fields:

```text
location
--------
canonical id / provider id
name
latitude
longitude
timezone
country code
country
admin1
```

The resolved provider location is the forecast identity. Forecast snapshots are
keyed to this canonical location rather than to the raw user query.

### 5.2 Location aliases

A separate alias mapping stores:

```text
location_alias
--------------
normalized query
canonical location id
```

The alias cache is intentionally conservative.

Normalization should make trivial input differences such as surrounding
whitespace and case differences reusable, while preserving words,
qualification and identity-bearing punctuation.

For example:

```text
" Cape Town "
"cape town"
```

may share an alias key.

But:

```text
"Cambridge"
"Cambridge, Massachusetts"
```

remain separate lookup keys.

The cache must not introduce fuzzy matching, infer suburbs, remove geographic
qualifiers, or otherwise weaken the existing geocoding contract.

A successful new geocoding result is persisted as a canonical location if it is
not already known, and the normalized query is persisted as an alias to that
location.

There is no geolocation-cache TTL or automatic re-resolution in v1.

### 5.3 Forecast source snapshots

Weather and marine snapshots are persisted independently.

Conceptually:

```text
source_snapshot
---------------
snapshot id
canonical location id
source type: WEATHER | MARINE
fetched at
storage schema version
application-owned forecast payload
```

The payload may be stored as versioned JSON text inside SQLite rather than
normalizing every hourly observation into relational rows.

That is deliberate. The service loads a source forecast as a whole and scores
it in memory; there is no product requirement to query individual hourly
observations with SQL. Fully normalizing every forecast timestep would add
schema and mapping complexity without a corresponding use case.

Persisted JSON must still represent the application-owned model and should be
parsed/validated on read rather than cast blindly.

A small storage schema version is appropriate so a future incompatible payload
change can be detected explicitly.

Each persisted source snapshot also records the product request window it was
fetched to support:

- `requestedFromDate`: the first complete destination-local target date;
- `requestedThroughDate`: the last complete destination-local target date.

These dates describe the product request horizon, not the timestamps that
happened to be returned by Open-Meteo.

For the seven-day product window:

`requestedThroughDate` is the seventh target date returned by the application's
destination-local date policy.

### 5.4 Snapshot history

Successful source refreshes append a new source snapshot rather than
destructively overwriting the previous row.

This keeps a previously fetched source available for bounded stale fallback
after a later refresh failure.

No historical weather analytics are implied by this. Snapshot cleanup and
retention remain outside the take-home scope.

For v1, stale fallback selects the most recent eligible persisted snapshot for
that source. Do not merge multiple historical snapshots into a synthetic
forecast and do not search older history for a supposedly "better" forecast
based on heuristic coverage.

---

## 6. Geolocation lookup lifecycle

A request begins with the normalized city/town query.

### Known alias

If the normalized query already exists in SQLite:

```text
query
    -> alias lookup
    -> canonical persisted location
```

Use the persisted canonical location directly.

Do not call the Open-Meteo geocoder again merely to refresh forecast data.

This allows a known location to continue using persisted or refreshable
forecast data even if the geocoding endpoint is temporarily unavailable.

### Unknown alias

If the alias is unknown:

```text
query
    -> Open-Meteo geocoding request
    -> existing populated-place and qualifier validation
    -> canonical ResolvedLocation
    -> persist location + alias
```

The existing geocoding semantics remain unchanged.

A failed geocoding request for a previously unknown alias cannot be recovered
from forecast persistence because the service does not yet know which canonical
location the caller means.

Geocoding network requests use the same bounded transient retry policy described
below.

A successful geocoding response that contains no acceptable city/town remains a
normal `LocationNotFoundError`; it is not retried as though it were a transient
network failure.

---

## 7. Weather and marine lifecycles are independent

Weather and marine are separate persisted sources.

They do not need to have the same `fetchedAt`, freshness state or refresh
outcome.

Examples that must be supported:

```text
weather = fresh
marine  = stale fallback
```

```text
weather = fresh partial
marine  = fresh complete
```

```text
weather = unavailable after refresh failure
marine  = fresh
```

A marine failure must not discard valid weather.

A weather failure must not discard valid marine, although activity scoring may
still be unable to use marine evidence where the accepted methodology also
requires weather evidence.

A successful refresh of one source is persisted even if the other source
fails.

Do not wrap weather and marine refresh into an all-or-nothing transaction.

---

## 8. Freshness

The normal freshness window is three hours.

Let:

```text
age = now - fetchedAt
```

A successfully persisted source snapshot with:

```text
age < 3 hours
```

“is fresh; reuse also requires request-window compatibility,

At exactly three hours old it requires refresh.

Freshness is evaluated independently per source.

### Fresh complete snapshot

Reuse it. Do not call that provider source.

### Fresh partial snapshot

Reuse it. Do not call that provider source.

Its missing data remains missing and may cause activity results to degrade to
`UNKNOWN`.

### Fresh successfully validated no-data snapshot

Reuse it for the three-hour freshness window.

This includes successful provider responses whose evidence legitimately
supports structural or no-data semantics. Do not repeatedly call the provider
simply because the source metadata is not `AVAILABLE`.

## 8.1 Request-window compatibility

Freshness alone is not sufficient for reuse.

A source snapshot is reusable without refresh only when it is both:

- fresh under the normal freshness policy; and
- window-compatible with the current seven-day target window.

A snapshot is window-compatible when its recorded `requestedThroughDate` is on
or after the last target date required by the current request.

The recorded date is the last complete destination-local calendar day the
snapshot was fetched to support.

It is not inferred from:

- the last timestamp actually returned by the provider;
- source `coveredDates`;
- the configured `forecast_hours`;
- the configured `forecast_days`; or
- a fixed number of hours added to `fetchedAt`.

Those are provider/request implementation details or evidence metadata rather
than the product horizon.

For example, a snapshot fetched when the target window is 9–15 September stores:

`requestedThroughDate = 2026-09-15`

If a later request still requires dates ending on 15 September and the
snapshot is fresh, it may be reused even if the provider returned only partial
evidence for some of those dates.

If the destination-local date advances and the new target window becomes
10–16 September, that snapshot is no longer window-compatible and refresh is
required even if its freshness TTL has not expired.

Actual returned coverage remains separate. A successful partial response does
not become immediately refreshable merely because its evidence is incomplete.
Its missing evidence affects source metadata and activity sufficiency instead.

normal reuse =
successful snapshot
AND fresh
AND window-compatible

    ---

## 9. Refresh

If no persisted source exists, or its most recent snapshot is at least three
hours old, refresh that source lazily when a request needs it.

Weather and marine refresh independently.

A successful refresh means:

1. the network request completed successfully;
2. the HTTP response was accepted;
3. the response JSON parsed successfully;
4. the provider response passed the existing runtime validation/mapping; and
5. the resulting application-owned source forecast was persisted successfully.

A valid successful response is persisted and becomes the selected current
source even when its actual forecast coverage is partial.

A successful partial refresh does **not** fall back to an older complete
snapshot. The new response is the latest validated provider evidence and is
cached for the normal freshness period.

---

## 10. Retry and timeout policy

The project has observed intermittent Open-Meteo connection failures during live
testing, including connection timeouts and an environment where IPv6 was
unreachable while IPv4 was viable.

The larger Spike 002 weather/marine request shapes were directly compared with
the earlier request and did not establish the added fields as the cause.

This spike therefore addresses ordinary transient network failure through
bounded request timeout and retry. It does not tune Node's global
IPv4/IPv6/address-family behaviour on the basis of one network environment.

### 10.1 V1 retry policy

Each Open-Meteo network operation uses at most three attempts total.

Default policy:

```text
attempt 1
    timeout after 4 seconds
if retryable failure:
    wait 250 ms

attempt 2
    timeout after 4 seconds
if retryable failure:
    wait 750 ms

attempt 3
    timeout after 4 seconds
then fail
```

No jitter is required for this single-instance take-home. A production system
with larger concurrency could add jitter.

The timeout is per attempt and must be enforced by the request itself, for
example with an abort signal, so a hung connection cannot prevent retry or stale
fallback indefinitely.

The retry mechanism should be deterministic-testable without real sleeping,
normally by injecting the sleeper/clock or equivalent small seam.

### 10.2 Retryable failures

Retry:

- network/fetch rejection;
- connection failure;
- request timeout/abort caused by the request timeout policy;
- HTTP `408`;
- HTTP `429`;
- HTTP `5xx`.

### 10.3 Non-retryable failures

Do not retry:

- ordinary non-retryable HTTP `4xx`;
- a successfully received response containing invalid JSON;
- a response that fails the existing provider schema/semantic validation;
- `LocationNotFoundError`;
- programmer errors or SQLite errors.

The distinction is intentional.

Retries are for failures that are plausibly transient at the network/provider
availability level. Retrying malformed application data or an invalid location
does not make the evidence more trustworthy.

### 10.4 Retry exhaustion

After all retry attempts for a forecast source are exhausted, the refresh has
failed for that source and the service enters the stale-fallback decision below.

For a previously unknown geolocation alias, retry exhaustion means the location
cannot be resolved and the request fails normally; there is no canonical
location against which a forecast fallback can safely be selected.

---

## 11. Stale fallback

A source snapshot is eligible as stale fallback when:

```text
3 hours <= age <= 24 hours
```

and the current refresh attempt for that source has failed.

At exactly 24 hours old it remains eligible.

Older than 24 hours is not usable.

Stale fallback is independent per source.

Example:

```text
weather refresh succeeds
marine refresh exhausts retries
latest marine snapshot is 7h old

=> use new weather + stale marine
```

The stale snapshot is not required to have complete coverage. Its real
timestamps and observations are passed to the existing source-coverage and
activity-sufficiency logic.

A recent partial stale snapshot may therefore support some ratings and leave
others `UNKNOWN`.

If no eligible stale snapshot exists after refresh failure, that source becomes
unavailable for the request.

Do not fabricate placeholder observations and do not convert provider failure
into `UNSUITABLE`.

### No cross-snapshot merge

A request uses at most one selected snapshot per source.

Do not fill holes in a newer weather or marine forecast using observations from
an older snapshot. Mixing forecast generations would add temporal semantics that
the product has not defined.

---

## 12. In-process refresh coalescing

The single-service-instance assumption remains.

When concurrent requests require refresh of the same canonical location/source,
they should share the same in-flight refresh work rather than trigger duplicate
Open-Meteo calls.

The implementation may retain location-level coalescing or refine it to
source-level coalescing. The observable requirement is:

> concurrent requests must not multiply equivalent provider refreshes for the
> same canonical source.

Cross-process/distributed locks remain out of scope.

Persistence does not replace coalescing: SQLite prevents data loss across
restart, while coalescing prevents duplicate work within one running process.

---

## 13. Request lifecycle

The intended full request path is:

```text
1. normalize input query

2. resolve location
   cached alias?
     yes -> load canonical persisted location
     no  -> geocode with bounded retry
            -> validate existing location rules
            -> persist location + alias

3. calculate seven destination-local target dates

4. load latest persisted WEATHER snapshot
   fresh?
     yes -> use it, even if partial
     no  -> coalesced weather refresh
              success -> persist + use new snapshot
              failure -> newest stale WEATHER <=24h?
                           yes -> use stale
                           no  -> weather unavailable

5. independently load/refresh/fallback MARINE using the same lifecycle

6. derive source metadata from the selected source snapshots and their real
   coverage

7. run the existing Spike 002 scorer/advisory logic against the selected
   application-owned weather and marine forecasts

8. return GraphQL assessment with per-source freshness/stale metadata
```

This is lazy refresh. There is no scheduler or background polling job.

---

## 14. GraphQL metadata

The existing source metadata already exposes provider/source availability and
covered target dates.

This spike must additionally make stale fallback visible.

A minimal intended source shape is:

```graphql
type SourceAvailability {
  state: SourceState!
  coveredDates: [String!]!
  fetchedAt: String
  stale: Boolean!
}
```

Semantics:

- `fetchedAt` is the successful source fetch time represented as an ISO-8601 UTC
  timestamp;
- `fetchedAt` is `null` when no source snapshot is available for the request;
- `stale` is `true` only when a snapshot is being served through the accepted
  stale-fallback path;
- a fresh partial source has `stale: false`;
- source `state` and `coveredDates` retain their existing coverage meaning.

Do not expose retry counts, internal storage identifiers or database rows in the
public GraphQL contract.

The already accepted advisory fields remain part of the final assessment shape.

---

## 15. Runnable GraphQL service

The final submission must be a runnable backend service, not only an exported
GraphQL schema.

Spike 003 therefore includes the final runtime wiring needed to:

- initialize/open the configured SQLite database;
- initialize the schema if necessary;
- construct persistence, Open-Meteo and `ForecastService` dependencies;
- expose the existing GraphQL schema through an HTTP endpoint; and
- provide an npm command that starts the service.

The HTTP layer should remain small.

Do not build a web UI, REST API, authentication system or framework-heavy server
architecture.

The exact GraphQL HTTP library/server wiring belongs to the Design Map, but a
reviewer must be able to start the project and execute the documented
`forecast(location: ...)` GraphQL query.

README documentation remains reserved for the final documentation phase under
`AGENTS.md`; this spike should make the commands possible but must not write the
README unless explicitly instructed later.

---

## 16. Persistence failure semantics

SQLite failure is not provider uncertainty.

If the application cannot read required persistence state, initialize its
schema, or persist a successfully refreshed source, treat that as an internal
service failure rather than silently converting it into `UNKNOWN`.

In particular, a successful provider response whose persistence write fails
must not be reported as though the durable refresh succeeded.

This keeps the source metadata honest and preserves the source brief's
requirement that provider data is actually persisted rather than merely held in
memory.

Tests should be able to inject or simulate storage failure without relying on a
real corrupted database.

---

## 17. Process restart behaviour

Persistence must be demonstrated across service/repository re-instantiation.

A representative case:

```text
service A:
    geocode "Cape Town"
    fetch weather + marine
    persist alias, location and snapshots

service A stops

service B starts using the same SQLite file:
    assess "Cape Town" within freshness window
    -> location resolved from persisted alias
    -> weather/marine loaded from SQLite
    -> no Open-Meteo geocoding or forecast request required
```

This is the important distinction between a durable cache and the existing
in-memory refresh coalescing.

---

## 18. Testing and acceptance criteria

The deterministic suite must establish the lifecycle without depending on live
Open-Meteo availability.

At minimum verify:

### Persistence and location aliases

- a first successful query persists canonical location and normalized alias;
- a subsequent request for the same normalized alias does not geocode again;
- a newly constructed service using the same SQLite database can reuse that
  alias after process restart;
- trivial case/whitespace normalization can reuse an alias;
- qualified and unqualified queries are not conflated;
- two aliases that genuinely resolve to the same provider location reuse the
  same canonical location record.

### Fresh reuse

- a successful weather snapshot younger than three hours is reused;
- a successful marine snapshot younger than three hours is reused;
- fresh partial data is reused rather than refreshed repeatedly;
- fresh successfully validated no-data/structural source responses are reused;
- actual source/activity evidence remains partial/unknown where appropriate.

### Refresh

- a source at exactly three hours triggers refresh;
- weather and marine refresh independently;
- one source may refresh successfully while the other fails;
- a successful partial refresh is persisted and selected rather than replaced
  by an older complete snapshot;
- concurrent equivalent refreshes are coalesced.

### Retry

- a transient network failure followed by success is retried and succeeds;
- retryable HTTP failure followed by success is retried;
- timeout is treated as retryable;
- retryable failure stops after three total attempts;
- ordinary non-retryable `4xx` is not retried;
- invalid JSON/provider validation failure is not retried;
- `LocationNotFoundError` is not retried;
- tests do not need to wait real backoff durations.

### Stale fallback

- after failed refresh, a source between three and 24 hours old is used;
- exactly 24 hours remains eligible;
- older than 24 hours is rejected;
- stale weather and fresh marine can be combined;
- fresh weather and stale marine can be combined;
- stale partial data remains partial rather than being promoted;
- no eligible source produces the existing unavailable/`UNKNOWN` degradation;
- snapshots from different fetch generations are not merged.

### Metadata

- fresh source has `stale: false`;
- stale fallback has `stale: true`;
- `fetchedAt` identifies the selected persisted source fetch;
- unavailable source has no `fetchedAt`;
- source state/covered dates still describe actual selected evidence.

### Persistence failure

- database read/write failure is surfaced as an internal error;
- a failed persistence write is not reported as a durable successful refresh.

### Runtime

- the service can be started against a real SQLite file;
- the GraphQL endpoint answers a forecast query;
- the GraphQL assessment includes ratings, accepted advisories, source coverage
  and freshness/stale metadata.

### Regression

- all accepted Spike 001 and Spike 002 deterministic behaviour remains green;
- activity scoring is not rewritten to accommodate persistence;
- the existing evaluator should still be able to validate scoring semantics
  independently of storage.

Live Open-Meteo integration remains useful supporting evidence, but network
flakiness must not decide the deterministic lifecycle verdict.

---

## 19. Deliberate non-goals

Do not expand this spike into:

- Redis or distributed caching;
- PostgreSQL or hosted database infrastructure;
- distributed refresh locks;
- multiple service instances;
- background/scheduled forecast refresh;
- provider failover or a generic provider interface hierarchy;
- fuzzy/local geocoding;
- geocoding TTL/invalidation policy;
- different freshness TTLs for partial and complete source responses;
- historical weather analytics;
- historical-snapshot quality optimization;
- merging observations from multiple forecast generations;
- long-term snapshot retention/cleanup;
- Node-wide IPv4 forcing or global address-family tuning;
- circuit breakers;
- adaptive/provider-specific retry budgets;
- user authentication;
- frontend work.

These are credible production concerns. They are intentionally excluded because
the take-home rewards focused reasoning over volume.

---

## 20. Deferred production improvements

The implementation should leave these as explicit deferrals rather than
accidentally implying they were forgotten:

### Partial-source refresh cadence

A production system might refresh partial successful responses sooner than
complete responses. V1 uses the same three-hour freshness policy to avoid an
additional state machine and request-amplification edge cases.

### Snapshot cleanup

Append-only source snapshots need retention/cleanup in a long-running
production system. The take-home does not need a scheduler or archival policy.

### Location invalidation

Persisted geocoder aliases may eventually need invalidation if provider
geography changes. V1 treats successful canonical resolution as durable.

### Network connection tuning

The live-test investigation observed IPv4/IPv6 connection-selection behaviour
while using a mobile hotspot. That is not enough evidence to change Node's
global networking defaults. If the problem is reproducible on stable deployment
networks, a provider-local dispatcher/connection policy can be considered
later.

### More advanced resilience

Circuit breakers, rate-limit-aware `Retry-After` scheduling, telemetry and
distributed single-flight would all be reasonable in a larger service but are
not necessary here.

---

## 21. Expected implementation boundaries

The Design Map should aim for small explicit responsibilities, conceptually
similar to:

```text
OpenMeteoClient
    provider HTTP + validation + retry/timeout boundary

LocationRepository
    canonical locations + aliases

ForecastSnapshotRepository
    persisted source snapshots

ForecastService
    request lifecycle
    freshness
    refresh
    stale fallback
    source composition
    scoring invocation

GraphQL
    public contract

Server/bootstrap
    SQLite + dependencies + HTTP lifecycle
```

This is not a requirement to use those exact class/module names.

Do not introduce a generic caching framework or generic persistence abstraction
whose only concrete implementation is SQLite.

The important architecture is that provider transport, durable storage,
lifecycle policy and activity scoring remain distinguishable.

---

## 22. Completion criteria

Spike 003 is complete when:

1. known locations and forecasts survive process restart;
2. repeated requests inside three hours do not call Open-Meteo merely because a
   successful response was partial;
3. weather and marine can independently be fresh, refreshed, stale or
   unavailable;
4. transient provider failures receive bounded retries and timeouts;
5. failed refresh can fall back to a source snapshot no more than 24 hours old;
6. stale use is visible in GraphQL metadata;
7. existing activity ratings/advisories are produced from persisted or refreshed
   application-owned source forecasts without semantic regression;
8. concurrent refresh duplication remains coalesced in-process;
9. the backend can be started and queried through GraphQL; and
10. deterministic tests and typecheck pass.

After implementation and evaluator verification, run the as-built phase for
Spike 003 and then perform the final README/documentation pass.
