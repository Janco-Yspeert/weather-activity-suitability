# Evaluation Result — Spike 003 — Persistence, Refresh Lifecycle, Retries and Runnable Service

Verdict: FAIL

This re-verification reused the unchanged PREPARED plan after the implementation
repair and incorporated the accepted human feedback on provider request horizon.
The stored-forecast validation failure is repaired. The retry failure is only
partially repaired: `RangeError` and other non-transport errors propagate, but
an uncaused programming `TypeError` is still retried and relabelled as provider
uncertainty.

## Human feedback and contract continuity

`human-feedback-forecast-timeline.md` clarifies that the 195-hour rolling
request intentionally provides a possible extra complete future day around
local midnight, while nine calendar days provide matching weather solar data.
`requestedThroughDate` therefore describes the last complete day the whole
source request was intended to support; it is not always the current seventh
target date, the ninth calendar row, or actual returned coverage.

This is an accepted contract refinement, but it does not invalidate the
prepared evaluator. EVAL-01 already requires persistence of the intended
request horizon, EVAL-03 tests compatibility independently of actual coverage,
and EVAL-07 permits coalescing keyed by equivalent requested horizon. The plan
never required `requestedThroughDate` to equal the current seventh date.
Supplemental boundary evidence was added without changing acceptance semantics.

## Planned-criterion results

### EVAL-01 — Durable data remains application-owned and validatable

**PASS — prior `IMPLEMENTATION_FAILURE` repaired.**

The storage boundary now shares semantic local date/time validation with the
provider boundary, checks stored timestamps against the canonical location's
timezone, retains timestamp/observation alignment, and checks solar dates and
timestamps. The retained regression proves `2026-02-30T99:99` is never returned
from storage; the full storage suite also covers application observation names,
solar round-trip, canonical aliases, and real-file reopen.

Independent lifecycle evidence continues to establish application-owned JSON,
append-only source generations, preserved solar data, and rejection of an
unsupported schema version. Ratings, advisories, raw Open-Meteo field names,
and provider DTOs are not persisted.

### EVAL-02 — Alias persistence preserves canonical identity across restart

**PASS.**

Real SQLite restart reuses normalized aliases, canonical location identity,
and both source snapshots without geocoding or forecast calls. Case and outer
whitespace normalize; qualification and identity-bearing punctuation remain;
multiple aliases can share one canonical record. Location/alias creation stays
transactional and known-alias forecast refresh does not re-geocode.

### EVAL-03 — Fresh reuse depends on age and requested horizon, not coverage

**PASS.**

Fresh, compatible complete, partial, and no-data snapshots are reused without
provider calls and retain honest evidence metadata. Exactly three hours and an
insufficient requested horizon trigger refresh. The repaired provider horizon
logic conservatively defaults to the required seventh date for simple provider
fakes, while Open-Meteo reports the extra day only when both its rolling hourly
and calendar inputs were intended to cover that complete day.

Supplemental checks establish the Cape Town boundary: a request at 20:59 local
reports the current final target date; at 21:00 local the 195-hour request
reports the following complete date for both sources. The visible rollover test
then advances across local midnight within the freshness window and reuses the
persisted partial snapshots without provider calls. Actual returned coverage is
not consulted when recording that intention.

### EVAL-04 — Refresh selection is independent, append-only, and generation-safe

**PASS.**

Independent and visible probes confirm successful sources persist separately,
a new partial/no-data generation wins over an older complete one, an unrelated
source can use stale fallback, and complementary generations are not merged.
SQLite retains prior generations and source success is not rolled back by the
other source's provider failure.

### EVAL-05 — Transport retries are bounded, classified, and timed per attempt

**FAIL — IMPLEMENTATION_FAILURE.**

The accepted retry mechanics otherwise pass: each attempt has a fresh four-
second timeout; classified transport failures and HTTP 408, 429, and 5xx use at
most three attempts with 250 ms and 750 ms waits; no wait follows attempt three;
ordinary 4xx, invalid JSON, provider validation failure, geocoding no-match,
and the retained `RangeError` programming case are not retried.

The classifier nevertheless begins with `error instanceof TypeError => true`.
An independent request-executor probe threw an uncaused
`TypeError("programmer type")`. It was called three times, both backoffs ran,
and the final error became `ProviderRequestError` whose cause was the original
`TypeError`. A coded `ECONNRESET` error was separately confirmed retryable, so
the probe distinguishes available transport evidence from error-class folklore.

The retained regression now covers both `RangeError` and uncaused `TypeError`.
The former passes and the latter fails. This is the same prepared criterion and
same public feedback as the prior verification, not a new requirement: the
brief and Design Map require retryable transport failures to be distinguished
from programming errors.

### EVAL-06 — Stale fallback is failure-gated, bounded, and source-local

**PASS.**

Fallback remains available only after provider refresh failure, including at
exactly 24 hours and excluding one millisecond older. Fresh/stale weather and
marine combinations remain independent. Partial stale data is not promoted,
new partial success wins over old complete data, and absent fallback produces
the inherited `UNAVAILABLE`/`UNKNOWN` behavior.

### EVAL-07 — Equivalent in-process refreshes are coalesced

**PASS.**

Concurrent equivalent aliases produce one refresh per canonical source;
distinct locations remain independent; settled and failed entries are released.
The repaired source key uses canonical location, source kind, and the provider-
reported intended horizon, preventing both duplicate equivalent work and
incorrect sharing across different request horizons.

### EVAL-08 — Persistence failure is an internal failure, never source metadata

**PASS.**

Schema initialization, required reads, alias/location transactions, and source
writes continue to propagate as internal failures. A successful provider result
is not selected until persistence completes. Storage failures never become
provider `UNAVAILABLE`, activity `UNKNOWN`, stale fallback, or ephemeral fresh
metadata. Semantic invalidity is now correctly recognized as such a storage
failure.

### EVAL-09 — Public metadata identifies exactly the selected source

**PASS.**

GraphQL `fetchedAt`, `stale`, source state, and covered dates continue to
identify the exact selected generation. Fresh partial/no-data data is not stale;
fallback exposes the old successful fetch time; unavailable sources have null
time and `stale: false`. No retry or storage internals leak into the schema.

### EVAL-10 — The composed service is restartable and reachable over HTTP

**PASS.**

Two real `npm start` processes were run sequentially with the same configured
SQLite file and localhost endpoint. A GraphQL forecast request returned the
persisted canonical location and both unchanged fresh source timestamps before
and after process restart, proving the default provider was not called. Build,
startup, configured database use, endpoint routing, and shutdown remain sound.

### EVAL-11 — Accepted location, scoring, advisory, and degradation behavior regresses cleanly

**PASS.**

All inherited location, destination-local date, 23/25-record, provider mapping,
source degradation, scoring, advisory, GraphQL, persistence, and HTTP tests pass
except the single supplemental EVAL-05 `TypeError` case. No scoring behavior or
public activity contract changed during repair.

## Classifications and supporting evidence

- **IMPLEMENTATION_FAILURE:** An uncaused programming `TypeError` thrown by the
  injected request executor is unconditionally treated as retryable transport
  failure, attempted three times, backed off, and relabelled as
  `ProviderRequestError`.
- **Prior implementation failure repaired:** persisted forecasts now receive
  semantic and timezone-aware local timestamp validation before selection.

No `EVALUATOR_DEFECT`, `SPECIFICATION_AMBIGUITY`, `INFRASTRUCTURE_FAILURE`, or
plan-invalidating `CONTRACT_CHANGED` finding affects this rerun.

## Commands and independent evidence

- `npm test` before extending the retained retry regression: 10 files,
  122 tests passed.
- Final `npm test`: 122 passed, 1 supplemental EVAL-05 test failed.
- `npm run typecheck`: passed.
- `npm run build`: passed, including each real server start.
- `node /tmp/eval003-lifecycle.mjs`: passed fresh reuse, exact three-hour,
  horizon mismatch, independent refresh/no-merge, exact 24-hour fallback,
  coalescing, SQLite history, and unsupported-schema checks.
- Independent retry-classification probe: `RangeError` propagated after one
  attempt; uncaused `TypeError` was retried three times with waits `[250,750]`
  and wrapped; coded `ECONNRESET` was retried three times as expected.
- Independent provider-horizon probe: 20:59 local retained the required final
  date; 21:00 local advanced by one complete date for weather and marine.
- Two permitted `npm start` processes and localhost GraphQL requests: real
  process restart and persisted reuse passed.
- `git diff --check`: passed.

The optional live Open-Meteo suite was not rerun. Network availability cannot
decide the remaining deterministic classification defect.

## Evaluator integrity and limitations

- The PREPARED plan was not rewritten. The human horizon correction fits its
  existing intended-horizon criteria and was tested as supplemental evidence.
- The widened retry regression uses the same injected request seam and oracle
  as the retained prior regression. A bare programming `TypeError` supplies no
  transport status, timeout identity, or network cause; the coded connection
  error control validates that the probe does not reject legitimate retry.
- The earlier corrected lifecycle-fixture and storage-test oracle mistakes
  remain disclosed in the historical result and supplied no adverse evidence
  here.
- Real process restart was rerun; in-process recreation was not substituted.
- Spike 002's superseded distinct-fall-back-hour identity was not reintroduced.

## Public feedback

- Request-execution retry classification must use evidence that a failure is a
  transient network/timeout condition. An uncaused programming `TypeError`
  must propagate without retries, backoff, or conversion to provider
  uncertainty merely because of its JavaScript class.
