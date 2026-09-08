# Selected AI-Assisted Reasoning Notes

These are short abstracts of a few conversations that materially changed the design of the service.

They are not transcripts, and they are not intended to be another source of truth. The briefs, calibration and decision record contain the accepted contracts. This file preserves some of the reasoning that led to them, including places where the first answer was revised or rejected.

---

## 1. Missing data: `UNKNOWN` is not `UNSUITABLE`

An early concern was how to avoid confidently recommending activities when the available forecast data was weak, while also avoiding the opposite mistake of calling an activity unsuitable simply because data was missing.

That led to a distinction which ended up influencing most of the scoring model:

- `UNKNOWN` means there is not enough trustworthy evidence to make the assessment.
- `UNSUITABLE` requires affirmative evidence.

This mattered particularly for surfing and skiing. A failed marine request cannot establish that surfing is unsuitable, so it becomes `UNKNOWN`. A successfully returned marine horizon in which all required marine series are explicitly null can be evidence that marine surfing is not applicable at that resolved location. Similarly, missing snow-depth data is not "no snow"; sufficiently broad snow-depth evidence showing effectively no snow can establish the skiing prerequisite failure.

The same distinction later became important for indoor sightseeing. Indoor weather suitability has a high baseline, but structural absence of surfing or skiing is not evidence that bad weather has removed an outdoor alternative.

**Decision:** preserve reason categories internally rather than treating every low or unsuitable result as equivalent.

---

## 2. The evaluator found a real bug, but its first interpretation was too conservative

The first implementation of surfing and skiing used the observations returned by the provider too directly when calculating evidence coverage. That created a denominator problem: removing timestamps could shrink the denominator and make sparse data appear complete.

The evaluator correctly exposed that defect.

The obvious repair was to derive expected activity-period slots independently from the records returned by Open-Meteo. Missing timestamps then remain missing evidence instead of disappearing from the calculation.

The first proposed consequence, however, was too blunt: if less than 70% of the wider activity period was observed, return `UNKNOWN`.

That threw away useful positive evidence. A complete two-hour surf session or four-hour skiing block can still be meaningful even if much of the rest of the day is missing.

The rule was therefore split:

- broad period coverage is required for ordinary daily aggregation and negative conclusions;
- a directly observed, complete minimum opportunity can support a conservatively capped positive result below that threshold;
- sparse adverse observations cannot prove that the whole day was poor.

**Decision:** keep provider-independent denominators, but allow activity-specific positive-opportunity fallback rather than blanket `UNKNOWN`.

---

## 3. Freshness, returned coverage and the requested forecast window are different things

The initial persistence rule tied normal reuse to both freshness and sufficient actual date coverage.

That looked reasonable until considering a provider that repeatedly returns a valid but truncated forecast. If partial data immediately makes a snapshot refreshable, every application request can cause another provider request without improving the evidence.

The first refinement was therefore to cache any successfully fetched and validated source response for the normal freshness period, even if it is partial.

That exposed another edge case. Suppose a snapshot is only an hour old, but midnight passes in the destination timezone. The seven-day target window moves forward by one day. The snapshot may still be fresh, but it was never fetched to serve that new last day.

Using `coveredDates` to solve this would reintroduce the first problem, because coverage describes what happened to come back rather than what the request attempted to obtain.

The model was split into three concepts:

1. request-window compatibility — which target horizon the fetch was intended to support;
2. actual source coverage — what usable evidence came back;
3. activity sufficiency — what conclusions that evidence supports.

**Decision:** normal reuse requires freshness and request-window compatibility. Actual returned coverage affects metadata and scoring, not whether a successful fresh response is immediately fetched again.

---

## 4. Persist geocoding results, but do not build a local geocoder

Forecast persistence raised a separate question: should a known location still require a geocoding request every time?

If the service has already resolved a user query to a canonical Open-Meteo location, requiring the geocoder again makes persisted forecast data less useful. A geocoding outage could prevent the application from reaching forecast data it already has for a known location.

The chosen model is deliberately small:

```text
normalized query
    -> persisted alias
    -> canonical resolved location
    -> persisted/refreshed forecast sources
```

A previously unknown query still goes to Open-Meteo and is validated using the accepted populated-place rules. Once resolved, the exact normalized query is stored as an alias for that canonical location.

This is not fuzzy matching. `"Cambridge"` and `"Cambridge, Massachusetts"` remain different query keys unless each has independently resolved. Multiple known aliases may point at the same canonical provider location.

There is also no invented geolocation refresh policy in v1. Successful canonical provider metadata is treated as stable enough for the scope of the service.

**Decision:** persist conservative query aliases and canonical locations so known requests can bypass geocoding, without attempting to become a geocoding system.

---

## 5. A flaky network did not justify redesigning the HTTP stack

Live integration testing produced intermittent Open-Meteo failures. Some failed quickly with an IPv6-unreachable path; others timed out while attempting IPv4 connections.

That initially made Node's address-family behaviour look suspicious, particularly because successful connections could take close to the family-selection attempt timeout.

Before changing the runtime networking configuration, the old and expanded marine requests were tested separately. Both showed similar intermittent behaviour, so the additional marine fields did not appear to be the cause.

There was also an important environmental fact: the tests were being run over a temporary mobile-phone hotspot because the normal local network was unavailable.

Several technically plausible fixes were considered — forcing IPv4, changing Node's family-selection timeout, or introducing a provider-specific HTTP dispatcher — but none was justified by stable evidence.

The operational problem that *was* clear was that provider calls needed bounded failure behaviour.

**Decision:** do not add global networking overrides based on one unstable environment. Add explicit request timeout and bounded retry behaviour at the Open-Meteo boundary, and only revisit lower-level network tuning if the problem reproduces consistently on a normal connection.

---

## 6. DST handling became more exact than the product needed

The original time-related requirement was modest: destination-local calendar dates matter, and a day should not be rejected merely because a daylight-saving transition gives it 23 or 25 hourly records.

While implementing evidence denominators and contiguity, this grew into a much more exact model. The scorer reconstructed expected local hourly slots by walking real instants, preserved duplicate local timestamps during a fall-back transition, and propagated an `expectedIndex` through skiing and surfing so two identical wall-clock hours could remain distinct contiguous observations.

The code was defensible and tested, but a later readability review questioned the value of that precision.

The useful product rules do not require modelling repeated wall-clock instants as separate identities. They require destination-local dates and activity periods, expected-slot denominators that do not shrink when provider data is missing, and no assumption that every calendar day has exactly 24 records.

The extra DST machinery made the time model considerably harder to understand for a very small edge-case gain.

**Decision:** simplify the contract and implementation. Keep local dates, local activity periods and provider-independent evidence denominators, but stop specially modelling repeated/skipped DST wall-clock instants. Ordinary missing/alignment rules are sufficient for v1.

---

## Notes on the role of AI

AI was useful for generating alternatives, stress-testing edge cases and producing implementation quickly. It was also capable of pushing a valid concern farther than the product needed, or proposing a repair that was technically neat but too conservative.

The recurring pattern in these conversations was therefore not "ask for an answer and implement it". It was:

```text
question
  -> proposed model
  -> contradiction or counterexample
  -> revised product decision
  -> implementation/evaluation
  -> human review
```

The accepted behaviour lives in the governing project documents; these abstracts simply retain some of the reasoning that would otherwise disappear when the chats end.
