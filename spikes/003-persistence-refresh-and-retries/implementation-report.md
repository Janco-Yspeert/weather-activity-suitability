# Spike 003 Implementation Report

Status: IMPLEMENTED

## Files and behavior changed

- `src/storage.ts` adds durable SQLite storage for canonical locations,
  conservative query aliases, and append-only weather/marine snapshots. Stored
  payloads are storage-versioned application forecasts and are validated on
  both write and read.
- `src/forecast-service.ts` now resolves aliases through storage, selects fresh
  request-window-compatible snapshots, refreshes weather and marine
  independently, coalesces equivalent in-process refreshes, persists successful
  refreshes before selecting them, and uses bounded stale fallback only after
  provider failure.
- `src/open-meteo.ts` applies a four-second timeout to each of at most three
  attempts, with deterministic 250 ms and 750 ms retry delays. Only classified
  transport failures and HTTP 408, 429, and 5xx responses are retried;
  programming errors propagate unchanged.
- `src/local-date-time.ts` provides shared semantic local date/time validation.
  SQLite reads and writes now reject impossible or timezone-invalid forecast
  timestamps before scoring can observe them.
- The Open-Meteo adapter now requests nine weather calendar days and reports
  the last complete day intended across its rolling hourly and calendar inputs.
  Late-evening 195-hour requests can therefore remain fresh across local
  midnight without deriving lifecycle compatibility from returned coverage.
- `src/graphql.ts` exposes selected-source `fetchedAt` and `stale` metadata.
- `src/application.ts`, `src/http-server.ts`, `src/server.ts`, the build config,
  and npm scripts provide a configurable SQLite composition boundary and a
  runnable `POST /graphql` HTTP service.
- Visible tests cover SQLite restart reuse, alias behavior, application-payload
  validation, fresh partial/no-data reuse, independent refresh and stale
  fallback, persistence failure, retries/timeouts, GraphQL metadata, and the
  runnable HTTP path.
- `test/integration/open-meteo.test.ts` no longer changes Node's global address
  family behavior and gives live requests enough time to exercise the accepted
  retry budget.

## Consequential implementation decisions

- Node 24's built-in SQLite driver is used directly. This supplies real durable
  transactions without adding an ORM or native dependency whose only job would
  be to hide a small amount of explicit SQL.
- Forecasts are stored as versioned application-owned JSON. The store rejects
  unknown/provider observation names, missing scoring observations, misaligned
  series, and marine solar data. This keeps provider DTOs outside persistence
  while preserving the whole scoring input as one snapshot generation.
- Source-level single-flight keys include canonical location, source kind, and
  the adapter-reported requested-through date. This permits independent
  weather/marine outcomes and avoids incorrectly sharing work across different
  product horizons.
- Request-horizon knowledge stays at the provider boundary. Providers that
  intentionally over-fetch can report that horizon; the service conservatively
  defaults to the final required date for simple fakes or providers without an
  extra buffer. This keeps the Open-Meteo-specific `195` out of lifecycle code.
- `fetchedAt` is captured after the provider response succeeds and before the
  database write. A source is not selected unless that write completes.
- The HTTP adapter uses Node's native server and `graphql` directly. The
  required endpoint is small enough that another server framework would add
  dependency surface without useful behavior.

## Rejected complexity or alternatives

- Fully normalized hourly SQL rows were rejected because selection and scoring
  consume a complete source generation; there is no SQL query use case for
  individual observations.
- Location-level refresh coalescing was narrowed to source-level coalescing so a
  fresh source does not become coupled to the other source's refresh lifecycle.
- No distributed locks, scheduler, fuzzy geocoding, snapshot merging, or
  retention subsystem was added; those remain outside the accepted single-node
  take-home contract.

## Unexpected implementation discoveries

- The live integration tests retained a hotspot-specific global address-family
  timeout override even though Spike 003 explicitly rejects such process-wide
  tuning. It was removed. Their original five-second test timeout was also
  shorter than the accepted worst-case retry duration, so only the live-test
  timeout was raised; production timeout and retry behavior were unchanged.
- Evaluator-retained tests established that storage validation was only
  syntactic and that every exception from request execution was treated as a
  transient fetch failure. Shared semantic timestamp validation and explicit
  transport-error classification repair those root causes rather than adding
  one-off guards for the example failures.

## Tests and checks run

- `npm test`: 10 files, 122 tests passed, including the localhost HTTP smoke
  test.
- `npm run typecheck`: passed.
- `npm run build`: passed and produced the runnable server build.
- Built-server startup smoke with an isolated SQLite path: passed.
- `npm run test:integration`: 4 live Open-Meteo tests passed.
- `git diff --check`: passed.

## Assumptions and limitations

- The spike brief header still says `DRAFT FOR HUMAN REVIEW`, but its stated
  downstream prerequisite is complete, the root lifecycle wording is aligned,
  and the Design Map is `READY`.
- `human-feedback-forecast-timeline.md` is treated as the accepted refinement
  of the older statement that `requestedThroughDate` is always the seventh
  target date. It changes only provider-request horizon accounting; evidence
  coverage and activity scoring remain unchanged.
- Partial-source refresh cadence, snapshot cleanup, and location invalidation
  remain deliberate production deferrals from the governing brief.
- The HTTP test requires permission to bind an ephemeral localhost port; the
  restricted default sandbox rejects that bind with `EPERM`, while the permitted
  test run passes.
