# Evaluation Plan — Spike 001 — Forecast Foundation

Status: PREPARED

## Evaluation basis

This plan falsifies the observable contract in `brief.md` and the necessary
shared seams in `design-map.md`. The parent `../../brief.md` and
`../../decisions.md` supply the inherited location, date-window, rating, and
partial-coverage semantics.

Verification must not require particular GraphQL names, schema-construction
style, dependency-injection mechanism, clock library, policy signatures,
canonical-key representation, provider request horizon, or internal forecast
shape. Where a deterministic probe needs control of time or provider results,
the evaluator will use the candidate's existing public or composition seam. A
missing evaluator-specific hook is not itself a product failure.

No evaluator-authored checks are prepared. The revised contract exposes no
stable implementation-independent executable seam beyond GraphQL itself, whose
field and type names remain intentionally free. The existing superseded
candidate does not define the replacement's names or composition seams.
Verification will run the eventual candidate's documented checks, inspect its
schema and boundary contracts, and construct bounded probes from the procedures
below where its ordinary composition seam permits.

## Criteria and procedures

### EVAL-001 — Canonical city or town resolution

**Invariant.** A supported city or town is resolved from the caller's complete
input to an accepted provider-backed location. The response exposes the
resolved geography, while canonical provider identity—not raw spelling—is used
for downstream snapshot and refresh identity. Qualified input must not silently
fall back to a result that contradicts its qualifiers.

**Evidence mode.** Automated black-box/composition probe plus inspection of the
provider mapping and canonical identity flow; relevant visible developer tests
may corroborate the result.

- **EVAL-001-A:** Supply a controlled geocoding response containing an accepted
  populated-place result for a supported unqualified query. Execute the GraphQL
  operation and expect the returned location to represent that resolved result,
  including enough resolved geography to distinguish it from the raw query.
- **EVAL-001-B:** Supply a qualified query and controlled candidates where one
  contradicts the qualifier. Expect the service not to silently select the
  contradictory place. Supply no qualifying accepted result and expect a
  request error rather than fallback to a different place.
- **EVAL-001-C:** Inspect or probe the application-owned resolved-location
  mapping and refresh key flow. Expect provider-backed canonical identity to
  survive mapping and feed refresh identity; changing only the raw query must
  not create distinct refresh identity once both queries resolve to the same
  provider location.

These procedures establish the public resolution behavior and identity
invariant without prescribing a geocoder client, DTO, key encoding, or GraphQL
field vocabulary.

### EVAL-002 — Seven destination-local complete future dates

**Invariant.** The returned window is exactly the seven chronological calendar
dates after the resolved location's current local date. Neither server nor
caller timezone changes it, and every activity sequence is aligned to that
order.

**Evidence mode.** Automated black-box/composition probes with controlled time
and resolved timezone, plus schema/result inspection.

- **EVAL-002-A:** Fix an instant for which the destination-local date differs
  from UTC or the server-local date. Execute the operation and expect exactly
  local-tomorrow through local-today-plus-seven, formatted as calendar dates in
  increasing order; expect local today to be absent.
- **EVAL-002-B:** Repeat the same instant and destination under two different
  process/caller timezone settings where practical. Expect the identical seven
  dates.
- **EVAL-002-C:** Use a seven-day window that crosses a destination daylight-
  saving transition. Expect seven consecutive local calendar dates with no
  duplicate or skipped date; do not require every date to contain exactly 24
  hourly observations.

The fixed-instant examples falsify UTC/server-time leakage and elapsed-hours
arithmetic while leaving clock and date-library choices free.

### EVAL-003 — Independently validated provider boundaries

**Invariant.** Geocoding, ordinary-weather, and marine response bodies remain
untrusted until runtime validation succeeds and are mapped into
application-owned types. Weather and marine validation failures are independent.
A malformed response cannot become source data or inferred coverage, and a
marine boundary failure cannot invalidate otherwise usable weather data.

**Evidence mode.** Automated provider-boundary/composition probes plus focused
inspection.

- **EVAL-003-A:** Return syntactically valid JSON with a structurally malformed
  geocoding result (for example, a required canonical identity, coordinates, or
  timezone of the selected result has the wrong type or is absent). Expect a
  boundary failure and no successful GraphQL foundation result.
- **EVAL-003-B:** Independently return syntactically valid JSON with a
  structurally malformed ordinary-weather payload and then a structurally
  malformed marine payload, including malformed or missing temporal data used
  for coverage. Expect each source adapter to fail at its own boundary, with no
  mapped source data or fabricated coverage. With otherwise valid weather, the
  malformed marine case must still produce a successful foundation response
  whose marine source is `UNAVAILABLE` with no covered target dates.
- **EVAL-003-C:** For the minimal fields each adapter actually requests, compare
  its runtime contract with the authoritative Open-Meteo response contract and
  probe both a provider-permitted null/omission and an invalid null/type. Expect
  permitted nullability to cross the boundary without inventing an observation,
  and prohibited nullability or types to fail validation. Coverage must include
  only dates the accepted mapped data makes usable under the candidate's stated
  foundation rule.
- **EVAL-003-D:** Inspect all three provider boundaries and downstream
  application contracts. Expect HTTP JSON to enter as untrusted data,
  validation to precede mapping, and provider DTO/raw JSON not to serve as the
  application model. Expect weather and marine acquisition outcomes to remain
  distinguishable after mapping.

Wrong-type, missing-field, and nullability probes test runtime behavior rather
than merely the presence of TypeScript declarations, without mandating a
validation library, requested observation set, or provider model.

### EVAL-004 — Actual per-source coverage

**Invariant.** Ordinary-weather and marine coverage are independently derived
from the usable dates/timestamps actually returned by each source. A request
horizon is not evidence that target dates are covered. Partial coverage remains
representable and must not be fabricated into full coverage.

**Evidence mode.** Automated application-boundary/composition probes and
inspection of coverage derivation; visible focused tests may supply additional
evidence.

- **EVAL-004-A:** For each source independently, return valid data whose usable
  dates cover all seven required target dates. Expect that source's coverage to
  contain all seven.
- **EVAL-004-B:** Keep the same nominal request horizon but omit at least one
  target date from one source's otherwise valid response while the other source
  remains complete. Expect only the changed source's actual coverage to omit
  that date and any sufficient-coverage decision for it to be false. The
  missing date must not be inferred from request length or the other source.
- **EVAL-004-C:** Return duplicate dates, extra dates outside the target window,
  and a non-24-hour DST date. Expect coverage to behave as local-date coverage:
  duplicates and out-of-window dates do not inflate it, while the DST date is
  not rejected merely for lacking exactly 24 hourly observations. This spike
  does not impose an activity-specific minimum-observation rule.

The paired full/partial payloads directly distinguish returned-data reasoning
from horizon inference and cross-source leakage while preserving freedom over
the requested variables and internal forecast model.

### EVAL-005 — Storage-independent lifecycle policy

**Invariant.** Snapshot metadata associates canonical location, `fetchedAt`,
and actual coverage. Normal reuse requires sufficient coverage and age strictly
under three hours. Refresh-failure fallback requires sufficient coverage and
age no greater than 24 hours. The policy does not depend on durable storage.

**Evidence mode.** Automated policy-level probe through the candidate's ordinary
application seam, supported by inspection and focused visible developer tests.

- **EVAL-005-A:** For sufficient coverage, expect normal reuse immediately and
  just below three hours old; expect it to be ineligible at exactly three hours
  and above.
- **EVAL-005-B:** For sufficient coverage after refresh failure, expect stale
  fallback eligibility at exactly 24 hours; expect ineligibility above 24
  hours.
- **EVAL-005-C:** Remove any one required target date while keeping age inside
  each threshold. Expect both normal reuse and stale-fallback eligibility to be
  false.
- **EVAL-005-D:** Inspect the policy inputs and dependencies. Expect decisions
  to use snapshot canonical identity, fetch time, actual coverage, required
  dates, and evaluation time without requiring a database/repository instance.

The exact-threshold and missing-coverage matrix captures the policy's asymmetric
`< 3h` and `<= 24h` rules without fixing function signatures or storage design.
Request-time reuse and fallback delivery are explicitly not evaluated in this
spike.

### EVAL-006 — GraphQL response, source metadata, and honest placeholders

**Invariant.** One GraphQL request accepts one city-or-town input and returns
one semantic result with response metadata, the resolved location, exactly
seven target dates, and date-aligned outcomes for skiing, surfing, outdoor
sightseeing, and indoor sightseeing. Metadata independently exposes weather
and marine state plus covered target dates. Every outcome in this spike is the
enum value `UNKNOWN`; availability is not smuggled into the rating placeholder.

**Evidence mode.** GraphQL schema inspection/introspection and automated
black-box execution against controlled successful provider responses.

- **EVAL-006-A:** Inspect the schema and expect a query operation accepting one
  city/town string and exposing semantic fields for metadata, resolved
  location, dates, and all four named activities. Expect metadata to expose
  distinct weather and marine records, each with a source state supporting
  `AVAILABLE`, `PARTIAL`, and `UNAVAILABLE`, and a sequence of covered dates.
  Expect the public rating vocabulary to include `UNKNOWN`; exact SDL names and
  nesting are free.
- **EVAL-006-B:** Execute a successful query. Expect one result, the provider-
  resolved location, seven chronological target dates, and seven outcomes for
  each of the four activities. Expect every outcome to be `UNKNOWN`, aligned by
  index with the dates.
- **EVAL-006-C:** For each source separately, provide usable coverage containing
  all seven target dates, then a non-empty proper subset, then no target dates.
  Expect respectively `AVAILABLE`, `PARTIAL`, and `UNAVAILABLE`. In every case,
  expect reported covered dates to equal that source's usable coverage
  intersected with the target window—no duplicates, extra dates, or dates
  borrowed from the other source.
- **EVAL-006-D:** Provide fully usable weather and make marine acquisition
  reject or fail boundary validation. Expect a successful GraphQL result with
  weather `AVAILABLE`, marine `UNAVAILABLE`, and no marine covered dates.
  Repeat with partial marine coverage and expect weather `AVAILABLE`, marine
  `PARTIAL`, and exactly the covered marine target dates.
- **EVAL-006-E:** Across full, partial, and unavailable source combinations,
  expect every activity outcome to remain `UNKNOWN`. Do not require
  activity-specific degradation semantics, which are deferred.

Schema semantics and result cardinality are observable without freezing names,
server framework, resolver layout, or later scoring design.

### EVAL-007 — Same-location in-process refresh coalescing

**Invariant.** Concurrent provider refreshes for one canonical resolved
location share the same in-flight work, without duplicate ordinary-weather or
marine acquisition. Distinct canonical locations do not share.
Settlement—successful or failed, including a degraded marine result—removes
the entry so later work can start a new refresh.

**Evidence mode.** Automated concurrency probes at the application composition
boundary with a controllable deferred forecast provider, plus focused
inspection. Provider call count and promise outcomes are the oracle; internal
map shape and promise identity are not.

- **EVAL-007-A:** Resolve two concurrent requests (including differently
  spelled/qualified inputs where useful) to the same canonical location, hold
  both source operations pending, and let both requests reach refresh. Expect
  exactly one ordinary-weather call and one marine call, with equivalent
  successful results for both after they are released.
- **EVAL-007-B:** Concurrently request two distinct canonical locations. Expect
  one ordinary-weather call and one marine call per location; neither request
  waits on or receives the other location's results.
- **EVAL-007-C:** After the shared successful operation settles, issue another
  request requiring refresh for the same location. Expect new source calls.
- **EVAL-007-D:** Repeat same-location concurrency with a rejected marine call
  and usable weather. Expect one attempted call per source, equivalent degraded
  results for all waiters, and no duplicate retry while the shared refresh is
  pending. After settlement, a later request must initiate new source work
  rather than reuse the settled operation.
- **EVAL-007-E:** Exercise a refresh path whose request-level outcome rejects.
  Expect all same-location waiters to observe the failure from one shared
  attempt; after settlement, a retry must initiate new source work rather than
  reuse a rejected operation.

These probes cover keying, isolation, and cleanup through observable call
counts and outcomes without prescribing a cache structure or concurrency
primitive.

### EVAL-008 — Repository checks and spike boundaries

**Invariant.** The TypeScript candidate is build/type-safe under repository
configuration, its visible developer tests pass, and it does not present the
Spike 001 placeholder as completion of activity scoring. Deferred request-time
persistence/reuse/fallback is not required for acceptance.

**Evidence mode.** Existing visible checks and focused inspection.

- **EVAL-008-A:** Run `npm test`. Expect exit status 0. Inspect relevant tests
  for semantic evidence of both provider boundaries, nullability, date
  boundaries, independent source-state classification, lifecycle thresholds,
  and concurrent cleanup rather than accepting a green suite as
  self-authenticating.
- **EVAL-008-B:** Run `npm run typecheck`. Expect exit status 0.
- **EVAL-008-C:** Inspect the public result behavior and implementation report.
  Expect `UNKNOWN` to be identified as a foundation placeholder. Do not fail the
  candidate for lacking durable storage, request-time snapshot reuse, stale
  fallback delivery, final weather/marine observation selection, or activity
  heuristics, all of which are outside this spike.

These checks establish repository fitness and guard against accidental scope
claims without turning deferred work into acceptance requirements.

## Verification integrity and limitations

- Verification must run every procedure above. When the candidate lacks a
  direct deterministic seam for a specific automated probe, the evaluator must
  combine observable GraphQL behavior, focused inspection, and trustworthy
  visible tests; it must not classify the absence of evaluator-only injection
  machinery as an implementation failure.
- Any newly written bounded probe must derive solely from a criterion above and
  validate its own call-count, time, or malformed-payload oracle before it can
  support a finding.
- Live Open-Meteo responses may supplement but cannot replace controlled
  malformed/nullability, per-source coverage, degradation, time-boundary, or
  concurrency evidence. Current authoritative provider documentation should be
  used only to validate the response contract for the fields the candidate
  actually requests; network availability and changing live data are not
  trustworthy acceptance oracles.
- The plan does not evaluate activity heuristics, final persistence, request-
  time snapshot reuse/stale fallback, distributed coordination, provider
  request-size constants, or an exactly-24-observations completeness rule.
- If the final candidate exposes no fair way to establish a material invariant
  except by implementation-coupled guessing, verification must distinguish a
  genuinely missing contract seam from mere evaluator inconvenience and return
  to the Design Map only when the former is established.
