# Design Map — Spike 003: Persistence, Refresh Lifecycle, Retries and Runnable Service

Status: READY

## Shared contracts

- The application composition boundary accepts a SQLite database-file path and
  constructs one durable location/snapshot store, the Open-Meteo client, the
  forecast service, and the existing GraphQL schema. Tests can supply an
  isolated file; the runnable server uses the configured normal-runtime path.
  Schema initialization belongs at this boundary and is safe to perform when
  the application starts.
- The forecast service owns request-time source selection. For each canonical
  location and each source (`WEATHER` and `MARINE`) it loads persisted state,
  applies lifecycle policy, refreshes when required, and passes exactly one
  selected application-owned forecast (or no forecast) per source to the
  existing scorer. Storage does not score, and scoring does not read SQLite.
- A durable source-snapshot record has a canonical location identity, source
  kind, successful fetch time, requested-through date, storage-schema version,
  and an application-owned forecast payload. A location/alias store preserves
  canonical resolved-location fields and normalized successful query aliases.
  Alias-to-location creation is atomic so a successful alias never points at a
  missing canonical location.
- Source payloads are serialized only after provider validation/mapping and are
  validated again when read. Invalid or unsupported stored payload is a storage
  failure, not source `UNAVAILABLE` or fabricated activity evidence.
- Open-Meteo transport owns the per-attempt timeout and retry policy for
  geocoding, weather, and marine requests. Its construction surface permits
  deterministic control of request execution and retry waiting/time without
  real sleeps. It distinguishes retryable transport/status failures from
  received invalid data, `LocationNotFoundError`, programming errors, and
  storage errors.
- GraphQL continues to be built from the forecast service and retains its
  accepted assessment fields. Per-source metadata adds `fetchedAt` and `stale`;
  it exposes neither retry/storage internals nor database identities. The HTTP
  server is an adapter that serves that schema, rather than another assessment
  implementation.

## Inherited contracts

- Canonical provider location identity, qualifier handling, destination-local
  next-seven-complete-date calculation, runtime provider validation, and the
  application-owned `ResolvedLocation`/`SourceForecast` boundary remain intact.
- `AVAILABLE`, `PARTIAL`, `NO_DATA`, and `UNAVAILABLE` continue to describe
  actual source evidence and covered target dates. The accepted Spike 002
  scoring, sufficiency, rating, and advisory rules consume selected forecasts
  unchanged.
- Expected provider failures degrade only the affected source. Unexpected
  programming failures remain errors; they are not relabelled as provider
  uncertainty.

## Design decisions

- Successful refreshes append source snapshots; selection reads the newest
  snapshot eligible under the current lifecycle branch for that source. Source
  generations are never merged.
  A later successful partial snapshot is authoritative over an older complete
  one for the normal freshness window.
- Fresh selection requires successful validation/persistence, `age < 3 hours`,
  and `requestedThroughDate` covering the current final target date. Actual
  coverage is intentionally excluded from this predicate. A window-incompatible
  fresh snapshot is refreshed.
- After that source's refresh fails, fallback selection is limited to its newest
  snapshot with `3 hours <= age <= 24 hours`; otherwise the source is absent for
  the request. Weather and marine follow this process independently.
- In-flight refresh coordination stays in the service layer. Its keying must
  ensure that equivalent concurrent refreshes for the same canonical source
  share work; a location-level operation may compose the two sources. Durable
  persistence does not substitute for this in-process coordination.
- The location alias lookup precedes geocoding. An alias miss may geocode and
  persist; an alias hit must not geocode merely to obtain a forecast. Geocoding
  retries use the same transport policy, but a valid no-match does not retry.

## Invariants

- A provider response becomes usable as a successful snapshot only after its
  database write completes. Storage read/write/schema failures propagate as
  internal service failures and must not be reported as durable refresh success
  or `UNKNOWN` source data.
- `stale` is true only for the bounded post-refresh-failure fallback path;
  `fetchedAt` names the selected snapshot's successful UTC fetch time and is
  null when no snapshot is selected. Fresh partial/no-data snapshots report
  `stale: false`.
- Source state and coverage are derived from the selected forecast's real
  observations. Staleness and freshness never manufacture coverage or activity
  sufficiency.
- A process re-created with the same database file can resolve a known alias
  and select still-fresh weather and marine snapshots without provider calls.

## Implementation freedom

- SQLite driver, SQL DDL/migration details, repository/module/class names,
  JSON representation, and the exact query-normalization implementation remain
  free, provided they preserve the durable model and conservative alias rules.
- The service may use location-level or source-level mechanics internally where
  they still avoid duplicate equivalent provider work and preserve independent
  weather/marine outcomes. It may run independent source refreshes in parallel.
- The HTTP/GraphQL server library, command name, configuration mechanism, and
  database-path default are free; the final server must accept a configured
  database location and make the documented `forecast(location: ...)` query
  reachable.
- A small fake/in-memory store or controlled SQLite file may be used in focused
  tests. It must not replace the required real-file restart demonstration.
