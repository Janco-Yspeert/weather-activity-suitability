# Evaluation Plan — Spike 003 — Persistence, Refresh Lifecycle, Retries and Runnable Service

Status: PREPARED

## Scope and evidence boundary

This plan evaluates Spike 003's persistence, location-alias, source-selection,
retry, stale-fallback, metadata, and runnable-service contract against its
`brief.md` and READY `design-map.md`. The accepted Spike 001 location,
destination-local date, provider-validation, coverage, degradation, and
coalescing behavior and the accepted Spike 002 scoring and advisory behavior
remain inherited where this change could regress them.

No Spike 003 candidate implementation or candidate-authored tests were read or
run during preparation. Repository code and tests were inspected only to
identify the inherited public service, provider, clock, and GraphQL semantics.
In particular, the old in-memory lifecycle helper and its visible tests predate
Spike 003's accepted separation of freshness, requested horizon, and actual
coverage; they are not an oracle for the new lifecycle.

Spike 002's later accepted DST simplification also governs inherited scoring
behavior here. A 23- or 25-record local date is not structurally rejected, but
v1 uses ordinary destination-local wall-clock slot identities: duplicate
fall-back timestamps do not represent separate expected slots, and a skipped
or missing timestamp remains ordinary missing evidence. Historical statements
in Spike 002's `evaluation-result.md` that require distinct repeated-hour
identity predate that refinement and are not an oracle for Spike 003.

No evaluator-authored files are declared under `evaluation-checks/`. The
Design Map deliberately leaves store, composition, and HTTP-library names free,
so executable checks written before those public surfaces exist would either
speculate about candidate structure or duplicate the contract. Verification
will use isolated temporary SQLite files, deterministic provider/request/time
controls exposed by the completed composition, black-box GraphQL calls, and
small adversarial probes derived from the criteria below.

Unless a procedure deliberately exercises real HTTP startup, it must not rely
on live Open-Meteo availability or real retry delays. Snapshot fetch times are
UTC instants; forecast observations retain validated destination-local
wall-clock timestamps, and target dates are calculated in that timezone.

## Required verification environment

- `npm run typecheck`
- `npm test`
- the implementation's documented server start command, with an isolated
  SQLite database path and a non-conflicting local port
- a GraphQL HTTP request to that running server's documented endpoint
- isolated SQLite files and deterministic provider/request, clock, and retry-
  wait controls for lifecycle procedures
- any additional command or temporary probe used during verification must be
  recorded in `evaluation-result.md`

The opt-in live-provider suite may supply supporting boundary evidence, but
network availability cannot decide the deterministic lifecycle verdict.

## Planned criteria

### EVAL-01 — Durable data remains application-owned and validatable

- **Evidence mode:** inspection plus automated checks against an isolated real
  SQLite file.
- **Procedure:** Complete one successful location, weather, and marine
  acquisition, close all application/store instances, and inspect/reopen the
  database. Establish that the durable state contains the canonical resolved
  location, normalized alias, independent source kind, successful fetch time,
  requested target horizon, schema version, and enough application-owned
  weather/marine data (including solar days) to reproduce scoring. Reopen and
  score from the stored payload. Through the storage boundary or a controlled
  database mutation, present an unsupported schema version and a malformed
  stored payload.
- **Expected result:** ratings and advisories are recomputed from one selected
  application-owned forecast per source; persisted payloads do not contain raw
  Open-Meteo DTO field names or precomputed public ratings/advisories. An
  unsupported or invalid stored payload fails as a storage/internal error
  rather than being cast, ignored, or reported as source uncertainty.
- **Negative/boundary probes:** verify weather and marine are distinguishable
  even when fetched at the same instant; verify a weather round trip retains
  date-keyed sunrise/sunset; corrupt only one required payload field rather
  than making the entire database unreadable.
- **Why sufficient:** round-trip behavior and rejection of bad durable data
  establish the persistence boundary without prescribing DDL, JSON layout,
  driver, or repository types.

### EVAL-02 — Alias persistence preserves canonical identity across restart

- **Evidence mode:** automated deterministic procedure with a real SQLite
  file, plus inspection of logical stored records.
- **Procedure:** With service A, assess `" Cape Town "` through a successful
  geocode and persist the result. Recreate every application dependency as
  service B over the same file and assess `"cape town"` while provider methods
  are instrumented to fail if called. Separately resolve two distinct query
  aliases to the same provider location, and resolve qualified and unqualified
  Cambridge queries to different canonical locations.
- **Expected result:** service B obtains the persisted canonical location and
  still-fresh sources without any geocoding or forecast request. Case and
  surrounding whitespace share an alias; genuine aliases can share one
  canonical record; identity-bearing words, punctuation, and qualifiers are
  not discarded or conflated. Successful alias creation never leaves an alias
  pointing at a missing location.
- **Negative/boundary probes:** an unknown qualified alias still geocodes using
  its full query; a failed geocode/persistence operation leaves no reusable
  dangling alias; known-alias forecast refresh does not re-geocode.
- **Why sufficient:** it proves both durable reuse and conservative alias
  semantics through observable calls and identities, without fixing the
  normalization algorithm or SQL schema.

### EVAL-03 — Fresh reuse depends on age and requested horizon, not coverage

- **Evidence mode:** automated deterministic service/GraphQL procedure.
- **Procedure:** Persist separate weather and marine snapshots whose fetch age
  is just below three hours and whose `requestedThroughDate` covers the current
  final target date. Repeat for complete, partial, and successfully validated
  no-data forecasts. Then test a snapshot at exactly three hours and a younger
  snapshot whose recorded requested horizon ends before the current final
  target date.
- **Expected result:** every fresh, window-compatible snapshot is reused with
  no call for that source, including partial and no-data snapshots. Its actual
  evidence still produces honest source state, covered dates, and activity
  sufficiency. Exactly three hours and a window-incompatible fresh snapshot
  each trigger refresh.
- **Negative/boundary probes:** keep actual timestamps/covered dates partial
  while extending only the recorded requested horizon, then reverse those
  conditions. Advancing the destination-local day beyond the recorded horizon
  triggers refresh even within the TTL.
- **Why sufficient:** this directly falsifies the tempting but obsolete
  `fresh && complete coverage` cache rule without constraining how selection is
  implemented.

### EVAL-04 — Refresh selection is independent, append-only, and generation-safe

- **Evidence mode:** automated deterministic procedure plus durable-state
  inspection.
- **Procedure:** Start with old complete weather and marine snapshots requiring
  refresh. Make weather return a valid partial response and marine return a
  valid complete response; then reverse success/failure combinations on a
  later request. Inspect the selected metadata and durable history after each
  successful source write.
- **Expected result:** each successful source is persisted and selected
  independently. A newer successful partial/no-data snapshot is authoritative
  for its normal freshness window and does not fall back to an older complete
  generation. Successful refreshes append rather than destroy the preceding
  fallback generation, and a request consumes at most one generation per
  source.
- **Negative/boundary probes:** give old and new generations complementary
  timestamp holes and assert the result does not contain their union; fail one
  source while the other persists successfully; verify no all-or-nothing
  weather/marine transaction rolls back the success.
- **Why sufficient:** selected evidence and retained fallback behavior expose
  generation mixing or coupled writes without mandating table design.

### EVAL-05 — Transport retries are bounded, classified, and timed per attempt

- **Evidence mode:** automated deterministic request-level procedure.
- **Procedure:** Apply the transport policy separately to geocoding, weather,
  and marine operations. For each, simulate network rejection, policy-caused
  timeout, HTTP 408, HTTP 429, and HTTP 5xx followed by success. Record request
  attempts, abort/timeout behavior, and requested waits. Exhaust one retryable
  case. Separately return an ordinary non-retryable 4xx, invalid JSON, a
  schema/semantic-invalid provider response, and a valid geocoder response
  with no acceptable location.
- **Expected result:** retryable failures make at most three total attempts,
  each with its own 4-second request timeout, with deterministic 250 ms then
  750 ms waits. Success is returned immediately when achieved. Exhaustion
  fails after attempt three. Each non-retryable case makes one attempt;
  `LocationNotFoundError` remains a normal no-match rather than transient
  provider failure. No test incurs real backoff sleeps.
- **Negative/boundary probes:** ensure an abort caused by unrelated caller or
  programming behavior is not blindly reclassified if the implementation can
  distinguish it; verify storage and programmer errors never enter transport
  retry; verify attempt three is not followed by another wait.
- **Why sufficient:** call counts, abort timing, and delay records establish
  the exact public failure policy while leaving retry helper structure free.

### EVAL-06 — Stale fallback is failure-gated, bounded, and source-local

- **Evidence mode:** automated deterministic service/GraphQL procedure.
- **Procedure:** Force refresh failure with stored snapshots aged just over
  three hours, exactly 24 hours, and just over 24 hours. Exercise weather stale
  plus marine fresh, weather fresh plus marine stale, and no eligible fallback.
  Repeat with a stale partial snapshot and with an older complete snapshot
  behind a newer eligible partial one.
- **Expected result:** only a failed current refresh permits fallback; ages in
  `3h <= age <= 24h` are eligible, exactly 24 hours is included, and older data
  is absent. Weather and marine outcomes remain independent. The newest
  eligible snapshot is used with its real partial evidence; the service does
  not search for an older “better” forecast or synthesize observations.
- **Negative/boundary probes:** confirm an age-expired snapshot is not served
  merely because refresh was slow; confirm a successful partial refresh wins
  over stale complete data; no eligible source yields the inherited
  `UNAVAILABLE`/`UNKNOWN` degradation rather than `UNSUITABLE`.
- **Why sufficient:** the boundary ages and mixed-source cases expose off-by-
  one, unconditional-stale, quality-search, and coupled-source errors without
  dictating the lifecycle state machine.

### EVAL-07 — Equivalent in-process refreshes are coalesced

- **Evidence mode:** automated concurrency procedure with controlled gates.
- **Procedure:** Block provider refresh completion, issue concurrent
  assessments that resolve to the same canonical location and require the same
  source refresh, then release the gate. Repeat for distinct canonical
  locations and for a subsequent request after the first in-flight operation
  has settled or failed.
- **Expected result:** concurrent equivalent work produces one provider call
  per canonical source and all callers observe the settled durable result.
  Distinct locations do not share work. Settled/failed in-flight entries are
  released so later required refreshes can proceed.
- **Negative/boundary probes:** use different aliases for the same persisted
  canonical identity; arrange one source as fresh and the other as stale so
  only the required source is called once; verify persistence does not replace
  or accidentally broaden in-process coordination.
- **Why sufficient:** provider call counts and caller results establish the
  concurrency invariant without requiring location-level versus source-level
  implementation.

### EVAL-08 — Persistence failure is an internal failure, never source metadata

- **Evidence mode:** automated failure-injection procedure.
- **Procedure:** Independently fail schema initialization, required location or
  snapshot reads, atomic location/alias creation, and snapshot writes after a
  successful provider response. Observe the request result, durable state, and
  GraphQL error behavior.
- **Expected result:** every required storage failure propagates as an internal
  service error. A source write failure is not served as a fresh in-memory
  success and does not emit `UNAVAILABLE`, `UNKNOWN`, a new `fetchedAt`, or
  durable-success metadata. Alias/location atomicity and previously committed
  snapshots remain intact as supported by SQLite transactions.
- **Negative/boundary probes:** contrast a provider failure, which may enter
  source-local fallback, with a storage failure, which may not; fail only the
  marine write after weather has committed and confirm the error is not hidden
  by weather success.
- **Why sufficient:** failure injection validates the semantic boundary and
  durability claim without requiring a corrupt physical database or a
  particular repository abstraction.

### EVAL-09 — Public metadata identifies exactly the selected source

- **Evidence mode:** automated GraphQL procedure and schema inspection.
- **Procedure:** Query assessments selecting fresh complete, fresh partial,
  stale partial, and unavailable weather/marine sources. Compare public
  metadata with the exact persisted rows selected by the lifecycle.
- **Expected result:** `fetchedAt` is the selected snapshot's ISO-8601 UTC
  successful-fetch instant and is null when no snapshot is selected; `stale`
  is true only for post-refresh-failure fallback. Fresh partial/no-data sources
  have `stale: false`. State and covered dates still describe actual selected
  observations. The schema exposes no retry counts, storage identifiers, or
  database rows and retains accepted ratings/advisories.
- **Negative/boundary probes:** ensure stale metadata does not use the failed
  refresh attempt time, newest ineligible row, or the other source's time;
  ensure a source at exactly three hours is not labelled stale when its refresh
  succeeds.
- **Why sufficient:** correlating metadata with controlled persisted
  generations catches plausible timestamp and stale-flag lies while remaining
  implementation-independent.

### EVAL-10 — The composed service is restartable and reachable over HTTP

- **Evidence mode:** automated/local manual black-box procedure.
- **Procedure:** Start the documented npm server command with a configured
  temporary SQLite path and local port. Execute the documented GraphQL
  `forecast(location: ...)` query through HTTP, stop the process cleanly, then
  start a newly composed process over the same database and repeat within the
  freshness window using controlled provider behavior where the runtime allows
  it. Check startup against both a new and initialized file.
- **Expected result:** schema initialization is safe at startup; the endpoint
  returns the full seven-date assessment with ratings, accepted advisories,
  source coverage, `fetchedAt`, and `stale`; the configured database path is
  honored; persisted state survives process/composition recreation. The HTTP
  adapter serves the existing GraphQL schema rather than a second assessment
  path.
- **Negative/boundary probes:** invalid GraphQL input follows normal GraphQL
  errors rather than crashing the server; a database initialization failure
  prevents dishonest startup/success; no UI, REST substitute, or scheduled
  refresh is required.
- **Why sufficient:** an actual process and HTTP request establish the delivery
  contract that module-level schema tests cannot, without selecting a server
  framework.

### EVAL-11 — Accepted location, scoring, advisory, and degradation behavior regresses cleanly

- **Evidence mode:** existing visible checks, deterministic controlled-input
  probes, and inspection.
- **Procedure:** Run all deterministic project tests and typechecking. Reuse
  representative accepted Spike 001/002 evaluator scenarios through the
  persistence-aware service: qualified canonical resolution, destination-local
  seven-day alignment, independent source states, partial/no-data/unavailable
  degradation, one positive score per activity family, and daily/forecast
  advisories. Inspect that selected application-owned forecasts enter the
  existing scorer and that ratings/advisories are not stored.
- **Expected result:** inherited observable behavior remains unchanged except
  for the additive source freshness metadata and lifecycle selection required
  here. Persistence neither rewrites scoring nor manufactures coverage,
  evidence, suitability, or advisory conclusions.
- **Negative/boundary probes:** serve a partial persisted source and verify
  missing evidence stays missing; vary storage generation while holding the
  selected application-owned forecast constant and obtain identical scoring;
  confirm a 23- or 25-record date is not rejected by record count alone without
  requiring distinct real-instant identities for repeated wall-clock hours;
  unexpected programming errors still propagate rather than degrade.
- **Why sufficient:** focused inherited probes plus the full deterministic
  suite catch plausible integration regressions without rerunning every prior
  calibration cell or making old implementation structure authoritative.

## Evaluator integrity and limitations

- The plan intentionally does not require table names, SQL normalization,
  repository/class names, server libraries, source-level versus location-level
  coalescing, or a particular JSON layout.
- Direct database inspection is used only to establish logical durability,
  application-owned payload content, append behavior, and validated reads. It
  must be adapted to the candidate's documented schema rather than treated as a
  hidden schema contract.
- Retry probes must validate their own fake request and timeout oracle before a
  failure is attributed to the candidate. Simulated aborts must distinguish
  policy timeout from arbitrary thrown errors where the contract does.
- Real process restart and HTTP evidence is mandatory; a second in-process
  object alone is insufficient for the runnable-service criterion, though it
  is useful for deterministic persistence isolation.
- Live-network failures are classified as infrastructure evidence unless a
  deterministic boundary probe reproduces a contract defect.

## Preparation outcome

The Spike 003 contract is independently falsifiable through stable observable
behavior. Evaluation is **PREPARED** without evaluator-authored checks.
