# As-Built — Spike 003 — Persistence, Refresh Lifecycle, Retries and Runnable Service

Status: ALIGNED

Historical scope: this reconstruction predates the accepted current-snapshot
amendment and subsequent repository-review repairs recorded in `../../WORKLOG.md`.
Its append-only descriptions apply to that earlier revision. Current storage
retains one snapshot per location/source, as specified by the amended brief.

## Implemented shape

Spike 003 composes the inherited forecast and activity-scoring service around a
durable SQLite store, a retrying Open-Meteo transport, and a runnable GraphQL
HTTP adapter. A configured database path creates one store during application
startup; that store owns canonical locations, normalized query aliases, and
append-only weather and marine source generations. The service selects one
generation per source, then passes the reconstructed application-owned
forecasts into the unchanged Spike 002 scorer.

The durable schema uses three strict SQLite tables: canonical locations,
aliases referencing those locations, and source snapshots referencing canonical
locations. A snapshot records source kind, successful fetch instant,
requested-from and requested-through dates, storage schema version, and a JSON
application forecast. Weather and marine share the snapshot table but remain
separate generations. An index orders each canonical source by fetch time and
insertion identity.

The application composition creates the SQLite schema synchronously and safely
on startup, constructs the provider and forecast service, builds the existing
GraphQL schema, and exposes a close operation. `npm start` builds and runs a
native Node HTTP server; `WEATHER_DATABASE_PATH`, `HOST`, and `PORT` configure
the runtime, with `weather.sqlite`, `127.0.0.1`, and port `4000` as defaults.

## Observable behavior and structural facts

- Location input is normalized with Unicode NFKC, outer-whitespace removal,
  and English lowercase conversion. A matching alias returns its canonical
  stored location without geocoding. An alias miss sends the trimmed full query
  through the inherited populated-place and qualifier rules, then transactionally
  upserts the canonical location and alias. Aliases have no TTL.
- Weather and marine source selection runs concurrently and independently. For
  each source, the newest snapshot is reused only when its age is non-negative
  and below three hours and its recorded request horizon covers the current
  final target date. Actual returned coverage is not a reuse predicate.
- Missing, exactly-three-hour-old, or window-incompatible sources refresh
  lazily. A successfully mapped forecast becomes selectable only after its
  snapshot write completes. Successful partial and all-null generations are
  authoritative for the same freshness window as complete generations.
- Successful refreshes append rows. The implementation neither merges source
  generations nor searches older rows for better coverage. After a provider
  failure, the latest generation for that source is selected as stale only
  when its age is between three and 24 hours inclusive. Otherwise that source
  is absent for the request.
- Only provider-classified failures enter stale fallback. Storage failures,
  invalid stored payloads, and unexpected programming errors propagate as
  internal failures instead of becoming source uncertainty.
- Concurrent equivalent refreshes share an in-process promise keyed by
  canonical location, source kind, and intended request-through date. Weather
  and marine do not block or coalesce each other, distinct horizons do not
  share work, and settled or failed entries are removed.
- The Open-Meteo adapter issues at most three attempts per geocoding, weather,
  or marine request. Every attempt receives a new four-second timeout signal;
  retry waits are 250 ms and 750 ms, with no wait after attempt three. HTTP
  408, 429, and 5xx, timeout/abort errors, and errors carrying recognized
  transport codes are retryable. Invalid responses, ordinary 4xx, location
  no-match, and errors without transport evidence are not.
- Open-Meteo requests 195 rolling hourly values for both sources and nine
  calendar days for weather solar data. The provider reports an extra complete
  request day only when the rolling hourly horizon—and, for weather, the solar
  calendar horizon—were intended to cover it. Returned evidence does not alter
  that recorded intention.
- Provider and stored timestamps are nominal destination-local calendar/clock
  values. Shared schemas reject malformed dates and times, while deliberately
  accepting a valid wall-clock value that does not identify a real instant
  during a DST gap. Observation arrays must align with timestamps; persisted
  sources must contain exactly their application-owned observation vocabulary;
  solar timestamps must match their date, and marine payloads cannot contain
  solar data.
- GraphQL source metadata describes the selected generation. `fetchedAt` is
  that snapshot's UTC ISO timestamp or null when absent; `stale` is true only
  for post-refresh-failure fallback. `AVAILABLE`, `PARTIAL`, and `NO_DATA`
  continue to derive from actual non-null observations on target dates, not
  freshness or the recorded request horizon.
- The HTTP adapter accepts JSON GraphQL requests at `POST /graphql`, delegates
  to the same schema and service used in-process, limits request bodies to one
  megabyte, and returns explicit 404/405/400 responses for adapter-level
  failures. Process shutdown closes the server and SQLite store.

## Inherited and changed behavior

Spike 001's canonical provider identity, destination-local seven-complete-day
window, provider runtime validation, source evidence states, and expected-error
degradation remain. Spike 002's activity-specific evidence, ratings, global
vetoes, advisory behavior, and deliberately simplified wall-clock/DST model
remain inside `scoreActivities`; persistence stores none of those derived
results.

The material Spike 003 change is lifecycle ownership around those inherited
contracts. Provider results now cross validation/mapping before durable
storage, survive service/process recreation, and are selected independently by
source using freshness, intended horizon, refresh outcome, and bounded stale
fallback. The public GraphQL contract adds per-source `fetchedAt` and `stale`
without exposing retries, storage identities, schema versions, or rows.

The later accepted provider-horizon correction is present: although the frozen
brief's earlier illustrative text names the current seventh target date,
`requestedThroughDate` may extend one further complete day when the fixed
Open-Meteo request shape was intended to support it across local midnight.
This does not promote returned coverage or alter activity evidence.

The later accepted DST simplification is also present. Repeated or skipped
wall-clock values are not reconstructed as distinct real instants; ordinary
missing-evidence and timestamp-alignment behavior continues to govern scoring.

## Assumptions, limitations, and deliberate omissions

- SQLite is the only durable implementation and uses Node 24's synchronous
  built-in driver directly. There is no ORM, generic repository framework, or
  provider-neutral persistence model.
- Storage schema version `1` is validated, but there is no migration machinery.
  Snapshot history grows without cleanup or retention because those policies
  are deliberately deferred.
- Refresh is request-driven. There is no scheduler, background refresh,
  proactive warming, shorter partial-response TTL, or alias re-resolution.
- Refresh coalescing is process-local. There are no distributed locks or
  cross-process coordination semantics.
- A fixed list of transport error codes supplies retry evidence. A generic
  uncaused `TypeError` is treated as a programming error rather than guessed to
  be a network failure.
- Stale fallback is unavailable for a fresh but request-window-incompatible
  generation because fallback eligibility starts at three hours. The service
  refreshes it and, on provider failure, reports the source unavailable rather
  than serving data outside the agreed fallback branch.
- Ratings remain weather-suitability heuristics with all Spike 002 domain
  limitations; persistence adds durability, not location existence, safety,
  terrain, tide, resort, or venue knowledge.
- The service exposes GraphQL only; no UI, REST assessment API, scheduled job,
  analytics store, or raw provider payload archive exists.

## Contract comparison

No Missing, Contradictory, or Extra material findings. The current candidate
matches the Spike 003 frozen brief, READY Design Map, accepted provider-horizon
correction, inherited Spike 001/002 behavior, and later accepted nominal
wall-clock refinement.
