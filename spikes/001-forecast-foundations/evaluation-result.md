# Evaluation Result — Spike 001 — Forecast Foundation

Verdict: PASS

## Summary

The repaired candidate satisfies every criterion and procedure in the prepared
evaluation plan. The three previous implementation failures now pass focused
developer regressions, independent adversarial probes, and inspection:

- authoritative qualifiers reject contradictory provider geography;
- semantically impossible destination-local timestamps fail at the provider
  boundary; and
- lifecycle snapshot metadata is associated with canonical location identity.

No `IMPLEMENTATION_FAILURE`, `SPECIFICATION_AMBIGUITY`, or `CONTRACT_CHANGED`
finding remains. One initial live-test failure was classified
`INFRASTRUCTURE_FAILURE` because sandbox DNS was unavailable; the unchanged
integration suite passed when rerun with network access.

## Procedure results

### EVAL-001 — Canonical city or town resolution: PASS

- **EVAL-001-A — PASS.** The complete caller query is sent to Open-Meteo; only
  accepted populated-place feature codes are eligible; the chosen result is
  mapped to application-owned resolved geography with provider ID.
- **EVAL-001-B — PASS.** Visible regressions and the independent Cambridge
  probe reject accepted populated-place results whose country or administrative
  geography contradicts comma-separated authoritative qualifiers. Matching is
  case-, punctuation-, and diacritic-insensitive; unrecognised qualifiers fail
  safely.
- **EVAL-001-C — PASS.** Canonical provider ID feeds both snapshot ownership
  policy and in-flight refresh identity. Different raw aliases resolving to the
  same ID share one refresh.

### EVAL-002 — Seven destination-local complete future dates: PASS

- **EVAL-002-A — PASS.** Fixed-instant probes return exactly the seven calendar
  dates after the resolved destination's local today, excluding today.
- **EVAL-002-B — PASS.** Changing process timezone between Honolulu and
  Auckland does not alter the Johannesburg target window.
- **EVAL-002-C — PASS.** A New York spring-forward window remains seven
  consecutive local dates. Visible coverage tests accept both 23- and 25-entry
  local dates rather than imposing a 24-record fiction.

### EVAL-003 — Independently validated provider boundaries: PASS

- **EVAL-003-A — PASS.** Malformed geocoding responses fail through the Zod
  provider schema before application mapping; coordinates, integer identity,
  feature code, and IANA timezone semantics are validated.
- **EVAL-003-B — PASS.** Weather and marine payloads independently reject
  missing or misaligned observations and impossible timestamps such as
  `2026-02-30T12:00`, `2026-09-07T25:00`, and the evaluator's
  `2026-09-07T99:99`. Valid weather survives an expected marine boundary
  failure as weather `AVAILABLE` and marine `UNAVAILABLE`.
- **EVAL-003-C — PASS.** Provider-permitted null observations are accepted and
  preserved without fabricating values; wrong types and misalignment fail.
  Open-Meteo's current weather and marine documentation confirms the selected
  hourly fields, destination-local timezone behavior, and rolling
  `forecast_hours` request parameters.
- **EVAL-003-D — PASS.** HTTP response bodies enter as `unknown`, validation
  precedes mapping, and raw provider field names remain inside the adapter.
  Weather and marine outcomes stay independent after mapping.
- **EVAL-003-E — PASS.** The application selects representative weather and
  marine observations; the adapter translates those application names into
  `temperature_2m` and `wave_height`. Tests inspect both generated requests.

### EVAL-004 — Actual per-source coverage: PASS

- **EVAL-004-A — PASS.** Each valid source independently reports all seven
  target dates when every date has a usable requested observation.
- **EVAL-004-B — PASS.** Missing/null observations affect only that source and
  date. Partial marine coverage remains `PARTIAL` while complete weather stays
  `AVAILABLE`; the 195-hour request is not treated as proof of coverage.
- **EVAL-004-C — PASS.** Duplicate dates are deduplicated, out-of-window dates
  are excluded, result dates remain target-window ordered, and 23-/25-entry DST
  days remain representable.

### EVAL-005 — Storage-independent lifecycle policy: PASS

- **EVAL-005-A — PASS.** Sufficient snapshots are fresh immediately and just
  below three hours, but not at exactly three hours.
- **EVAL-005-B — PASS.** Sufficient stale fallback remains eligible through
  exactly 24 hours and becomes ineligible immediately after.
- **EVAL-005-C — PASS.** Missing any required date makes both policies false
  regardless of otherwise acceptable age.
- **EVAL-005-D — PASS.** `SnapshotMetadata` now includes canonical
  `locationId`; fresh and stale policies require it to match the requested
  canonical identity in addition to fetch time and actual coverage. The policy
  remains storage-independent.

### EVAL-006 — GraphQL response, source metadata, and placeholders: PASS

- **EVAL-006-A — PASS.** Schema inspection exposes one city/town string input,
  resolved location, weather and marine source records, all four source states,
  covered dates, target dates, and four activity outcome sequences.
- **EVAL-006-B — PASS.** GraphQL execution returns one resolved location, seven
  chronological dates, and seven aligned `UNKNOWN` outcomes per activity.
- **EVAL-006-C — PASS.** Full, non-empty partial, and successful empty/null
  source evidence produces `AVAILABLE`, `PARTIAL`, and `NO_DATA` respectively;
  covered dates are exactly the usable target-window intersection.
- **EVAL-006-D — PASS.** Expected marine request/validation failure produces a
  successful degraded result with marine `UNAVAILABLE` and empty covered dates,
  without invalidating usable weather. Partial marine data remains `PARTIAL`.
- **EVAL-006-E — PASS.** Every availability combination retains `UNKNOWN`
  activity outcomes; `NO_DATA` is not converted into `UNSUITABLE`.

### EVAL-007 — Same-location in-process refresh coalescing: PASS

- **EVAL-007-A — PASS.** Concurrent aliases resolving to one provider ID issue
  one weather and one marine call and receive equivalent results.
- **EVAL-007-B — PASS.** Distinct canonical IDs issue independent source calls
  and do not share results.
- **EVAL-007-C — PASS.** A later request starts new source work after successful
  settlement.
- **EVAL-007-D — PASS.** Concurrent expected marine failure is shared once,
  yields equivalent degraded results, and releases the key for a later retry.
- **EVAL-007-E — PASS.** Unexpected request-level failure propagates to waiters
  and `finally` cleanup permits a later attempt. Only the shared `ProviderError`
  family is converted to `UNAVAILABLE`; programming defects are not disguised
  as provider degradation.

### EVAL-008 — Repository checks and spike boundaries: PASS

- **EVAL-008-A — PASS.** `npm test` passed 5 files and 28 tests. Developer tests
  cover both boundaries, nullability, semantic timestamps, qualifier rejection,
  four-state metadata, observation translation, lifecycle identity and
  thresholds, DST coverage, source degradation, GraphQL execution, and
  coalescing cleanup through stable behavior.
- **EVAL-008-B — PASS.** `npm run typecheck` passed under strict TypeScript
  settings. `npm ls --depth=0` also reported a valid dependency tree.
- **EVAL-008-C — PASS.** The implementation and report retain `UNKNOWN` as a
  Spike 001 placeholder and do not claim deferred persistence, request-time
  reuse/fallback, final observation selection, or activity scoring.

## Commands and evidence

- `npm test` — passed: 5 files, 28 tests.
- `npm run typecheck` — passed.
- `npm ls --depth=0` — passed with the declared GraphQL, Zod, TypeScript,
  Vitest, and Node type packages.
- `npm run test:integration` — first failed because sandbox DNS returned
  `EAI_AGAIN`; the unchanged command passed 1 file and 4 tests with network
  access. Classification: resolved `INFRASTRUCTURE_FAILURE`.
- Candidate TypeScript emitted successfully to an isolated `/tmp` directory.
- `node /tmp/weather-evaluator-001-probes-20260907.mjs` — all ten independent
  probe groups passed after correcting the probe's degraded-source error type.
- `git diff --check` — passed.

## Evaluator integrity and limitations

- Verification reused the prepared plan and its existing `EVAL-003-E`
  correction; no acceptance criterion was added after seeing the repair.
- The first supplemental concurrency run used a generic programming error to
  represent an expected provider failure. That probe was unsound because the
  candidate correctly distinguishes the two. Replacing it with the public
  provider-request error validated the intended degradation oracle; candidate
  code and acceptance semantics were unchanged.
- The prior deterministic failure probes were rerun unchanged for qualifier
  contradiction and impossible timestamps. Both now pass.
- The live integration suite supplements deterministic evidence only. Its
  sandbox DNS failure was reproduced as environmental and disappeared with
  network access.
- Activity scoring, durable persistence, request-path snapshot reuse/fallback,
  distributed coordination, HTTP transport, exact GraphQL names, final
  activity observations, and exactly-24-record completeness remain outside
  this verdict.

## Public feedback

No contract-level retry feedback. Spike 001 passes the prepared evaluation.
