# Evaluation Result — Spike 003 — Persistence, Refresh Lifecycle, Retries and Runnable Service

Verdict: PASS

This verification reused the unchanged PREPARED plan against the current
candidate. The previous retry-classification failure is repaired: an uncaused
programming `TypeError` now propagates without retry or relabelling, while
timeout/abort and evidenced network failures retain the accepted bounded retry
behavior. The accepted nominal wall-clock simplification also remains coherent
with stored-payload validation and inherited scoring semantics.

## Contract continuity

The accepted provider-horizon refinement remains part of this verification.
`requestedThroughDate` describes the last complete destination-local day the
whole source request was intended to support. It is independent of actual
returned coverage, so a valid partial response can remain reusable without
being promoted to complete evidence.

The later accepted DST simplification is also preserved. Provider and stored
timestamps are nominal destination-local wall-clock values in v1. They must be
real calendar/clock values and remain aligned with observations and solar
dates, but they are not reconstructed as timezone instants merely to reject a
DST-gap wall time.

Neither clarification changes the PREPARED plan's acceptance semantics.

## Planned-criterion results

### EVAL-01 — Durable data remains application-owned and validatable

**PASS.**

Real SQLite round-trip and inspection establish canonical location/alias data,
independent weather and marine generations, fetch time, intended request
horizon, schema version, application-owned observations, and weather solar
data. Reopened forecasts reproduce scoring inputs. Raw Open-Meteo field names,
ratings, and advisories are not stored.

Unsupported schema versions and malformed application forecasts fail at the
storage boundary. Shared nominal date/time schemas reject impossible values;
series alignment, allowed/required observations, marine solar exclusion, and
solar-date consistency are also enforced. Ratings and advisories remain
recomputed from the selected generation.

### EVAL-02 — Alias persistence preserves canonical identity across restart

**PASS.**

Real-file restart and visible alias checks reuse canonical location identity
and fresh source snapshots without geocoding or forecast requests. Case and
outer whitespace normalize, distinct qualifiers and identity-bearing text are
not discarded, multiple aliases may share one canonical location, and
location/alias creation is transactional. A known alias can refresh forecasts
without re-geocoding.

### EVAL-03 — Fresh reuse depends on age and requested horizon, not coverage

**PASS.**

Independent lifecycle probes reused fresh compatible complete, partial, and
no-data snapshots without provider calls while preserving honest state and
coverage. A snapshot at exactly three hours and a younger snapshot whose
requested horizon is insufficient each triggered refresh.

Provider-horizon tests retain the local-midnight boundary: the 195-hour rolling
request advances the recorded complete-day horizon only when all required
source inputs were intended to cover the additional day. The rollover test
then reuses a persisted partial generation across midnight without consulting
actual returned coverage.

### EVAL-04 — Refresh selection is independent, append-only, and generation-safe

**PASS.**

Independent and visible probes show source-local refresh and persistence, a
new partial/no-data generation taking precedence over an older complete one,
retained append-only history, and no merging of complementary holes across
generations. One source's success remains committed and selectable when the
other source fails.

### EVAL-05 — Transport retries are bounded, classified, and timed per attempt

**PASS — previous `IMPLEMENTATION_FAILURE` repaired.**

Visible tests establish a fresh four-second timeout per attempt, timeout and
abort retry, HTTP 408/429/5xx retry, three-attempt exhaustion, exact 250 ms and
750 ms waits, and no wait after attempt three. Ordinary 4xx, invalid JSON,
invalid provider data, valid geocoder no-match, and programming errors remain
non-retryable.

An independent request-executor probe exercised geocoding, weather, and marine
operations separately. For every operation, an uncaused programming
`TypeError` propagated by identity after one attempt with no waits. A coded
`ECONNRESET` control made three attempts, recorded waits `[250, 750]`, and
exhausted as `ProviderRequestError`. This validates the repaired classifier
against actual transport evidence rather than error-class folklore.

### EVAL-06 — Stale fallback is failure-gated, bounded, and source-local

**PASS.**

Independent lifecycle probes and visible tests admit fallback only after
provider failure, include exactly 24 hours, exclude one millisecond older, and
preserve independent fresh/stale weather and marine combinations. Partial
fallback remains partial, newer successful partial data wins over older
complete data, and no eligible source yields `UNAVAILABLE`/`UNKNOWN` rather
than fabricated suitability.

### EVAL-07 — Equivalent in-process refreshes are coalesced

**PASS.**

Controlled concurrent assessments produced one provider call per canonical
source. The coordination key distinguishes canonical location, source, and
intended horizon; distinct locations do not share work, and settled or failed
entries are released. Persistence remains durable state rather than a dubious
replacement for in-process coordination.

### EVAL-08 — Persistence failure is an internal failure, never source metadata

**PASS.**

Schema initialization, required reads, transactional alias/location creation,
and source writes propagate as internal failures. A provider result is not
selected until its write completes. Storage failure is never converted into
source `UNAVAILABLE`, stale fallback, activity `UNKNOWN`, or an ephemeral new
`fetchedAt`; independently committed source history remains intact.

### EVAL-09 — Public metadata identifies exactly the selected source

**PASS.**

GraphQL `fetchedAt`, `stale`, state, and covered dates identify the exact
selected generation. Fresh partial/no-data snapshots report `stale: false`,
fallback retains the old successful fetch time, and absent sources have null
time with `stale: false`. Retry, database, and storage-schema internals are not
exposed, while accepted ratings and advisories remain present.

### EVAL-10 — The composed service is restartable and reachable over HTTP

**PASS.**

The documented `npm start` path built and started a real server with a
configured temporary SQLite file. A localhost GraphQL request returned the
seven-day assessment and exact persisted weather/marine fetch timestamps. A
second real process over the same file returned the same canonical location,
dates, source states, and timestamps without needing the provider, establishing
restart reuse and safe schema initialization. Visible HTTP checks cover routing,
invalid requests, GraphQL errors, and clean adapter behavior.

### EVAL-11 — Accepted location, scoring, advisory, and degradation behavior regresses cleanly

**PASS.**

All deterministic location, destination-local date, provider mapping,
23/25-record, source degradation, scoring, advisory, persistence, GraphQL, and
HTTP checks pass. Selected application-owned forecasts still enter the existing
scorer; persistence does not store or manufacture coverage, evidence,
suitability, or advisories. Unexpected programming errors continue to
propagate rather than degrading into provider uncertainty.

## Classifications and supporting evidence

- **Prior `IMPLEMENTATION_FAILURE` repaired:** uncaused programming
  `TypeError`s no longer enter transport retry or become provider uncertainty.
- **Prior timestamp implementation overreach removed:** nominal wall-clock
  validation now matches the accepted v1 DST model while still rejecting
  malformed/impossible stored values.

No `IMPLEMENTATION_FAILURE`, `EVALUATOR_DEFECT`, `SPECIFICATION_AMBIGUITY`,
`INFRASTRUCTURE_FAILURE`, or plan-invalidating `CONTRACT_CHANGED` finding
remains in the current candidate.

## Commands and independent evidence

- `npm test`: 10 files, 124 tests passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run test:integration`: 4 live Open-Meteo checks passed. This is
  supporting boundary evidence only; it did not decide the deterministic
  verdict.
- `node /tmp/eval003-lifecycle.mjs`: passed fresh partial/no-data reuse, exact
  three-hour refresh, horizon mismatch, independent refresh/no-merge, exact
  24-hour fallback, coalescing, append history, and unsupported-schema checks.
- `node /tmp/eval003-retry.mjs`: passed independent programming-versus-network
  classification for geocoding, weather, and marine.
- Real documented server start plus localhost GraphQL request: passed.
- `node /tmp/eval003-http-restart.mjs`: passed a second real process and
  persisted GraphQL reuse over the same database file.
- `git diff --check`: passed.

One initial restart-harness invocation failed to parse because its inline
JavaScript was incorrectly shell-escaped. It started no product process and
supplied no product evidence; the same probe was moved unchanged in substance
to a temporary module and passed.

## Evaluator integrity and limitations

- The PREPARED plan was not rewritten and no candidate-shaped requirement was
  added after inspection.
- Independent probes use public construction seams and logical durable state;
  they do not require private helper names or a hidden SQL layout contract.
- The transport probe validates its oracle with both a non-transport control
  and a coded network control for each public operation.
- Real process and HTTP evidence was rerun; in-process recreation was not used
  as a substitute for the delivery criterion.
- No evaluator probe was promoted into the visible suite. The material repaired
  cases—bare programming `TypeError`, abort, evidenced network failure, and a
  nominal DST-gap wall time—already have focused permanent regressions, so
  adding duplicates would weaken rather than improve the suite.

## Public feedback

Spike 003 satisfies the prepared persistence, refresh, retry, stale-fallback,
metadata, runnable-service, and inherited-behavior contract. No contract-level
implementation issue remains for another implementation retry.
