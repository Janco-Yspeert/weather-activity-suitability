# Evaluation Result — Spike 001 — Forecast Foundation

Verdict: FAIL

## Summary

The candidate satisfies the destination-local date window, independent source
acquisition and availability metadata, `NO_DATA` semantics, placeholder
ratings, observation translation, lifecycle age/coverage thresholds, GraphQL
shape, and in-process refresh coalescing.

Three contract failures remain:

1. qualified location input is forwarded intact but is not enforced when
   selecting a provider result;
2. syntactically shaped but semantically impossible local timestamps cross the
   provider boundary and can create false coverage; and
3. the storage-independent lifecycle representation does not associate
   snapshot metadata with canonical location identity.

All three are classified `IMPLEMENTATION_FAILURE`. The failures were reproduced
or established against the prepared contract; no specification or
infrastructure failure explains them.

## Procedure results

### EVAL-001 — Canonical city or town resolution: FAIL

- **EVAL-001-A — PASS.** The visible provider test sends the complete qualified
  string to Open-Meteo, skips a rejected `PPLX` result, maps the first accepted
  populated-place result into application-owned resolved geography, and returns
  its provider ID.
- **EVAL-001-B — FAIL (`IMPLEMENTATION_FAILURE`).** A controlled probe queried
  `Cambridge, Massachusetts` while returning only an accepted populated-place
  result for Cambridge, England. `resolveLocation` resolved that contradictory
  result instead of failing. Inspection confirms selection filters only by
  feature code after forwarding the query; it does not enforce supplied
  qualifiers (`src/open-meteo.ts:48-55`). The parent brief and decision record
  explicitly make qualifiers authoritative.
- **EVAL-001-C — PASS.** Resolved provider ID feeds the in-flight refresh key
  (`src/forecast-service.ts:81-86`). The visible same-location concurrency test
  resolves `Cape Town` and `Kaapstad` to the same provider identity and observes
  one weather and one marine acquisition.

### EVAL-002 — Seven destination-local complete future dates: PASS

- **EVAL-002-A — PASS.** Both the visible test and independent probe fix an
  instant where Johannesburg's local date differs from UTC and obtain exactly
  local-tomorrow through local-today-plus-seven, excluding today.
- **EVAL-002-B — PASS.** The independent probe changes process timezone from
  `Pacific/Honolulu` to `Pacific/Auckland`; the Johannesburg result remains
  identical because the resolved destination timezone is used explicitly.
- **EVAL-002-C — PASS.** An independent New York probe spanning the 8 March
  2026 DST transition returns seven consecutive local dates. Inspection shows
  the window advances calendar dates rather than assuming seven 24-hour
  intervals (`src/forecast-policy.ts:11-25`).

### EVAL-003 — Independently validated provider boundaries: FAIL

- **EVAL-003-A — PASS.** The visible malformed-geocoding test establishes that
  wrong-typed selected-location data fails with `ProviderResponseError` before
  mapping. Inspection also confirms coordinate ranges and IANA timezone names
  are validated.
- **EVAL-003-B — FAIL (`IMPLEMENTATION_FAILURE`).** Visible tests prove missing
  or misaligned observation arrays fail independently for weather and marine,
  and marine failure becomes `UNAVAILABLE` without discarding usable weather.
  However, an independent probe supplied `2026-09-07T99:99`; the weather
  adapter accepted and mapped it. The timestamp validator checks only
  `YYYY-MM-DDTHH:MM` character shape (`src/open-meteo.ts:23,207-210`), not
  calendar/time validity. Downstream logic slices its date and may therefore
  fabricate target-date coverage (`src/forecast-service.ts:119-126`).
- **EVAL-003-C — PASS.** Current Open-Meteo documentation confirms the selected
  `temperature_2m` and `wave_height` hourly fields, destination-local timestamps
  when `timezone` is supplied, and rolling `forecast_hours`. The adapters accept
  finite numbers or null and require arrays aligned with hourly timestamps.
  Independent null probes preserve null rather than manufacturing a value.
- **EVAL-003-D — PASS.** Fetch response bodies enter as `unknown`; explicit
  runtime validation precedes mapping to `ResolvedLocation` and
  `SourceForecast`. Provider field names remain at the adapter boundary.
- **EVAL-003-E — PASS.** `ForecastService` selects application observations and
  passes them to the provider (`src/forecast-service.ts:7-8,96-100`); the
  Open-Meteo client translates them to provider fields when constructing each
  URL (`src/open-meteo.ts:24-29,83-100`). Visible tests inspect both translated
  requests.

### EVAL-004 — Actual per-source coverage: PASS

- **EVAL-004-A — PASS.** Full controlled weather and marine data independently
  produce coverage for all seven target dates.
- **EVAL-004-B — PASS.** A visible mixed-source test keeps weather complete
  while marine has only two usable target dates; only marine becomes `PARTIAL`,
  with exactly those dates. Coverage is not borrowed from weather or inferred
  from the 195-hour request.
- **EVAL-004-C — PASS.** An independent probe supplies duplicate dates and
  dates outside the target window. The result deduplicates coverage and reports
  only the seven ordered target dates. The DST probe confirms no exactly-24-
  observations requirement is imposed.

The invalid-timestamp defect is recorded under the provider-boundary criterion
that directly falsifies it; the full/partial/duplicate coverage procedures
otherwise pass.

### EVAL-005 — Storage-independent lifecycle policy: FAIL

- **EVAL-005-A — PASS.** Independent and visible probes establish normal reuse
  immediately and at 2:59:59.999, with rejection at exactly three hours.
- **EVAL-005-B — PASS.** Stale fallback is eligible at exactly 24 hours and
  ineligible one millisecond later.
- **EVAL-005-C — PASS.** Removing a required date makes both fresh reuse and
  stale fallback ineligible even within their age windows.
- **EVAL-005-D — FAIL (`IMPLEMENTATION_FAILURE`).** The policy is correctly
  storage-independent and accepts fetch time, actual coverage, required dates,
  and evaluation time. Its `SnapshotMetadata`, however, contains only
  `fetchedAt` and `coveredDates` (`src/forecast-policy.ts:3-6`). No lifecycle
  type or policy input associates that snapshot metadata with canonical
  resolved-location identity. Refresh keying by location ID satisfies
  coalescing but does not establish the separate snapshot-lifecycle invariant.

### EVAL-006 — GraphQL response, source metadata, and placeholders: PASS

- **EVAL-006-A — PASS.** Schema inspection finds one city/town string input,
  resolved location, metadata records for weather and marine, four source
  states, covered dates, seven target dates, and all four activity sequences.
- **EVAL-006-B — PASS.** The visible GraphQL execution returns one resolved
  location, seven chronological dates, and seven aligned `UNKNOWN` values for
  every activity.
- **EVAL-006-C — PASS.** Controlled full, partial, and all-null responses
  produce `AVAILABLE`, `PARTIAL`, and `NO_DATA`; reported dates are the ordered
  intersection of usable coverage and the target window. `NO_DATA` reports an
  empty list.
- **EVAL-006-D — PASS.** A rejected/malformed marine source produces a
  successful response with weather `AVAILABLE`, marine `UNAVAILABLE`, and no
  marine covered dates. Partial marine data remains independently `PARTIAL`.
- **EVAL-006-E — PASS.** Available, partial, no-data, and unavailable cases all
  retain `UNKNOWN` activity outcomes. In particular, `NO_DATA` does not become
  `UNSUITABLE`.

### EVAL-007 — Same-location in-process refresh coalescing: PASS

- **EVAL-007-A — PASS.** Visible and independent concurrency probes observe one
  weather and one marine call for simultaneous aliases resolving to one
  canonical provider ID.
- **EVAL-007-B — PASS.** Simultaneous distinct canonical IDs cause two calls per
  source and do not share results.
- **EVAL-007-C — PASS.** An independent sequential probe observes new weather
  and marine calls after a successful shared refresh settles.
- **EVAL-007-D — PASS.** An independent gated probe observes one call per
  source for simultaneous same-location requests when marine rejects, equal
  degraded results for both waiters, and new source work after settlement.
- **EVAL-007-E — PASS.** A bounded request-level rejection probe confirms the
  `finally` cleanup permits a later same-location attempt. Inspection confirms
  cleanup is identity-guarded (`src/forecast-service.ts:81-93`).

### EVAL-008 — Repository checks and spike boundaries: PASS

- **EVAL-008-A — PASS.** `npm test` completed with 5 files and 20 tests passing.
  The visible tests provide useful semantic evidence for most criteria, but
  omit contradictory qualified results, semantically invalid timestamps, and
  canonical identity in lifecycle metadata—the three failures above.
- **EVAL-008-B — PASS.** `npm run typecheck` completed successfully under the
  repository's strict TypeScript configuration.
- **EVAL-008-C — PASS.** Public behavior and the implementation report identify
  all activity values as Spike 001 `UNKNOWN` placeholders. No deferred durable
  persistence, request-time reuse/fallback, final activity observation set, or
  scoring behavior was required. `git diff --check` also completed cleanly.

## Commands and supplemental probes

- `npm test` — passed: 5 files, 20 tests.
- `npm run typecheck` — passed.
- TypeScript emission to an isolated `/tmp` directory — passed and left the
  candidate unchanged.
- `node /tmp/weather-evaluator-001-probes-20260907.mjs` — eight independent
  probe groups passed and two failed reproducibly: authoritative qualifiers and
  invalid local timestamp rejection.
- Live Cape Town requests to both Open-Meteo endpoints using the candidate's
  selected fields, destination timezone, and 195-hour horizon — both returned
  HTTP success, 195 aligned timestamps/values, the requested timezone, and the
  expected rolling window. These supplement but do not replace deterministic
  evidence.

## Evaluator integrity and limitations

- During verification, `EVAL-003-E` was corrected because its original demand
  to vary to a second observation imposed extensibility the contract never
  required. The correction is recorded in `evaluation-plan.md`; ownership and
  translation semantics did not change, and the candidate was not modified.
- The qualifier oracle uses an unambiguous contradiction rather than requiring
  an undisclosed fuzzy-matching algorithm: Massachusetts was requested and the
  sole provider candidate was explicitly England, United Kingdom.
- The timestamp oracle uses an impossible hour/minute in the exact textual
  shape accepted by the candidate. Open-Meteo documents hourly timestamps as
  ISO 8601 local time, under which `99:99` is invalid.
- Live-provider success does not excuse either deterministic failure. Provider
  results and network availability vary; malformed and adversarial cases need
  controlled evidence.
- The evaluator did not require activity scoring, persistence, HTTP transport,
  particular GraphQL names, a validation dependency, a different observation
  set, or an exactly-24-observations day rule.

## Engineering observations

- `asSourceOutcome` catches every rejection and discards its cause. This meets
  the current public `UNAVAILABLE` contract, but it also turns programming
  defects and provider failures into indistinguishable metadata. Preserving an
  internal cause or restricting the catch boundary would make later diagnosis
  substantially less grim without changing the GraphQL contract.

## Public feedback

- A qualified location must not resolve to a provider result that contradicts
  the supplied qualifier. Forwarding the complete query to the provider is
  necessary but not sufficient; when no accepted result matches an
  authoritative qualifier, the request must fail.
- Provider hourly timestamps must be semantically valid destination-local ISO
  8601 timestamps before mapping or coverage calculation. A string matching the
  expected character pattern but containing an impossible calendar date or
  time must fail at that source boundary.
- The storage-independent snapshot lifecycle contract must associate snapshot
  metadata with canonical resolved-location identity in addition to fetch time
  and actual coverage.
