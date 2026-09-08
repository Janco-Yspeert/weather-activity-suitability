# Evaluation Result — Spike 003 — Persistence, Refresh Lifecycle, Retries and Runnable Service

Verdict: FAIL

The candidate satisfies the persistence lifecycle, alias/restart reuse,
freshness/horizon selection, independent refresh/fallback, coalescing, public
metadata, and runnable HTTP contracts. Two independently reproduced contract
failures remain: stored application forecasts are not semantically revalidated
for possible local timestamps, and arbitrary programming errors thrown by
request execution are retried and relabelled as provider failures.

## Planned-criterion results

### EVAL-01 — Durable data remains application-owned and validatable

**FAIL — IMPLEMENTATION_FAILURE.**

Real-file round trips preserve canonical location data, aliases, source kind,
fetch time, requested dates, the full application-owned weather/marine
observations, and weather solar days. SQLite inspection established append-only
rows and payloads containing application names rather than Open-Meteo field
names or public ratings/advisories. Unsupported storage schema version `999`
is rejected on read, and the visible storage tests reject provider observation
names.

The stored-forecast validator accepts `2026-02-30T99:99` because its timestamp
check is only a lexical regular expression. `appendSnapshot` persists it and
`latestSnapshot` returns it without error. This contradicts the Design Map
requirement that persisted application forecasts be validated again when read
and that an invalid stored payload become a storage failure. The failure was
reproduced first by an independent Node probe and then by the permanent
contract-level regression in `test/storage.test.ts`.

This is not a demand for a particular schema or write-time check. The promoted
test accepts either rejection before persistence or rejection on read; it fails
only because the invalid forecast is returned as usable.

### EVAL-02 — Alias persistence preserves canonical identity across restart

**PASS.**

The real-SQLite restart test recreates the store and service, reuses
`" CAPE TOWN "` through the normalized persisted alias, and makes no geocoding,
weather, or marine call. Visible storage checks establish that two aliases can
share one canonical location while absent/qualified aliases remain distinct.
Inspection confirms normalization preserves words and punctuation and that
location plus alias writes are enclosed in one SQLite transaction with rollback
on failure. Known-alias source refresh does not geocode.

### EVAL-03 — Fresh reuse depends on age and requested horizon, not coverage

**PASS.**

Visible checks and the independent lifecycle probe establish reuse immediately
below three hours for partial weather and all-null/no-data marine snapshots,
without provider calls. Actual metadata remains respectively `PARTIAL` and
`NO_DATA`. Exactly three hours triggers independent refresh, as does a snapshot
younger than three hours whose `requestedThroughDate` ends before the current
final target date. Selection does not inspect actual covered dates when deciding
normal reuse.

### EVAL-04 — Refresh selection is independent, append-only, and generation-safe

**PASS.**

Controlled refresh produced new one-date partial weather while marine failed.
The result selected only the new weather date, with `stale: false`, while marine
used its old eligible generation with `stale: true`. Complementary old weather
observations were not merged into the new result. SQLite inspection found two
weather snapshot rows after two successful generations, and source writes are
not wrapped in an all-or-nothing weather/marine transaction.

### EVAL-05 — Transport retries are bounded, classified, and timed per attempt

**FAIL — IMPLEMENTATION_FAILURE.**

The accepted cases work: each attempt receives a fresh four-second timeout
signal; transient request/timeout failures and HTTP 408, 429, and 5xx statuses
use at most three total attempts with 250 ms and 750 ms waits; attempt three is
not followed by another wait; ordinary 4xx, invalid JSON, provider validation
failure, and a valid geocoding no-match are not retried. Tests use injected
delays and do not sleep in real time.

However, `requestWithRetry` catches every rejection from the injected request
executor. An independent probe threw a `RangeError("programmer defect")`; the
candidate invoked the request three times, waited 250 ms and 750 ms, and finally
wrapped the error as `ProviderRequestError`. The permanent regression in
`test/open-meteo.test.ts` reproduces the same behavior. The brief and Design Map
explicitly require programmer errors to propagate without retry or conversion
to provider uncertainty.

### EVAL-06 — Stale fallback is failure-gated, bounded, and source-local

**PASS.**

Controlled probes establish fallback only after provider refresh failure,
inclusive eligibility at exactly 24 hours, and rejection one millisecond beyond
24 hours. Mixed fresh/stale weather and marine outcomes work independently.
Partial stale data retains its real coverage; a successful new partial refresh
wins over the older complete snapshot, and no cross-generation merge occurs.
Without an eligible fallback the source has `UNAVAILABLE`, null `fetchedAt`,
`stale: false`, and unsupported ratings remain `UNKNOWN`.

### EVAL-07 — Equivalent in-process refreshes are coalesced

**PASS.**

Gated concurrent assessments for equivalent aliases and one canonical location
produced exactly one weather and one marine refresh. Distinct canonical
locations remain independent. Inspection and visible tests establish that keys
include canonical source and requested horizon, fresh sources are not pulled
into the other source's refresh, and settled or failed operations remove their
in-flight entry so later work can proceed.

### EVAL-08 — Persistence failure is an internal failure, never source metadata

**PASS.**

Injected snapshot-write and required-read failures propagate from the service;
they are outside the provider-only fallback catch and cannot become
`UNAVAILABLE`, `UNKNOWN`, or fresh ephemeral success. SQLite initialization
errors likewise escape composition before the server listens. Location/alias
creation is transactional. Weather and marine refresh writes remain independent,
but any storage failure in the assessment is not hidden by the other source's
success.

The semantic-validation defect reported under EVAL-01 is the case where the
store fails to recognize invalid data at all; once a storage operation does
fail, its classification and propagation behavior are correct.

### EVAL-09 — Public metadata identifies exactly the selected source

**PASS.**

GraphQL exposes `fetchedAt` and `stale` alongside the inherited source state and
covered dates. Fresh complete, partial, and no-data snapshots report their own
UTC fetch instant with `stale: false`; stale fallback reports the selected old
snapshot's instant with `stale: true`; unavailable sources report null and
false. A successful refresh at the exact three-hour boundary reports the new
time rather than stale metadata. Schema inspection found no retry count,
storage identity, or database-row leakage and confirmed ratings/advisories
remain present.

### EVAL-10 — The composed service is restartable and reachable over HTTP

**PASS.**

`npm start` builds and starts the native HTTP server using configured
`WEATHER_DATABASE_PATH`, `HOST`, and `PORT` values. Against a pre-populated
temporary SQLite file, a real `POST /graphql` returned the canonical location,
seven current destination-local dates, both source states and persisted fetch
times, four aligned rating arrays, and advisory fields. An invalid GraphQL field
returned a normal GraphQL error.

The process was stopped, a new `npm start` process was created over the same
file, and an uppercase alias query immediately returned the same location and
unchanged persisted source timestamps. The default live provider therefore was
not needed. The first bind attempt failed with sandbox `EPERM`; rerunning the
same procedure with localhost-bind permission succeeded, classifying the first
attempt as **INFRASTRUCTURE_FAILURE**, not candidate evidence.

### EVAL-11 — Accepted location, scoring, advisory, and degradation behavior regresses cleanly

**PASS.**

Before the two evaluator regressions were added, all 118 existing deterministic
tests passed. They cover qualified location behavior, destination-local dates,
23/25-record non-rejection, source degradation, scoring calibration,
advisories, GraphQL alignment, persistence integration, and HTTP delivery.
Inspection confirms selected application-owned forecasts enter the existing
scorer and ratings/advisories are not stored. Typechecking and the production
build pass.

After adding the two focused contract regressions, the full suite reports 118
passing and exactly two failing tests. Those failures belong solely to EVAL-01
and EVAL-05 above; no inherited scoring or provider-mapping regression failed.

## Classifications and supporting evidence

- **IMPLEMENTATION_FAILURE:** Stored forecast timestamp validation is lexical
  rather than semantic, allowing impossible application timestamps to be
  selected after persistence.
- **IMPLEMENTATION_FAILURE:** Request execution retries and relabels a clear
  programmer error instead of limiting retry to transient transport failures.
- **INFRASTRUCTURE_FAILURE (resolved):** Restricted sandboxing initially denied
  localhost bind with `EPERM`; the identical elevated server procedure passed.

No `EVALUATOR_DEFECT`, `SPECIFICATION_AMBIGUITY`, or `CONTRACT_CHANGED` finding
affects the verdict.

## Commands and independent evidence

- `npm test` before supplemental regressions: 10 files, 118 tests passed.
- `npm run typecheck`: passed before and after supplemental tests.
- `npm run build`: passed before and after supplemental tests.
- `node /tmp/eval003-lifecycle.mjs`: passed fresh reuse, exact three-hour,
  horizon mismatch, independent refresh/no-merge, exact 24-hour fallback,
  coalescing, SQLite history, and unsupported-schema probes.
- Independent inline Node probe: reported
  `invalidStoredTimestampAccepted: true`, three attempts and waits `[250,750]`
  for an injected `RangeError`.
- `npx vitest run test/storage.test.ts test/open-meteo.test.ts`: 20 passed, the
  two promoted contract regressions failed as independently predicted.
- Final `npm test`: 118 passed, 2 failed.
- Two permitted `npm start` processes plus localhost GraphQL POSTs: startup,
  query, invalid-query handling, stop/start, and persisted reuse passed.
- `git diff --check`: passed.

The live Open-Meteo integration suite was not required or rerun. Its network
availability cannot decide either deterministic finding.

## Evaluator integrity and limitations

- The evaluation reused the unchanged PREPARED plan. The two supplemental
  regressions derive directly from EVAL-01 and EVAL-05 and use public store and
  transport construction seams; they add no architecture or behavior.
- The first lifecycle probe incorrectly expected `NO_DATA` while its fixture
  still supplied non-null marine period values. That probe oracle was corrected
  before use, then rerun successfully; it supports no candidate finding in its
  erroneous form.
- The first promoted storage test demanded rejection specifically on write.
  The contract permits earlier rejection but requires rejection on read. The
  test was corrected before the final run to accept either boundary and fails
  only because the invalid forecast is returned.
- SQLite inspection was limited to logical append count, durable content, and
  controlled schema-version corruption. Table names and DDL are not acceptance
  requirements.
- Process restart was genuine. Deterministic service recreation remains
  supporting evidence rather than a substitute for it.
- Spike 002's superseded distinct-fall-back-hour claim was not used. The
  accepted simplified wall-clock semantics govern inherited regression checks.

## Public feedback

- Persisted application forecasts must be semantically validated before they
  are returned for scoring. A timestamp can match the storage string pattern
  while still being an impossible local date/time; such payloads must fail as
  storage/internal errors rather than become selected source evidence.
- Retry only failures classified as transient transport/provider availability
  failures. A programming error raised by request execution must propagate
  without repeated attempts, backoff, or conversion to provider uncertainty.
