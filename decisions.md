# Product and Engineering Decisions

This is the working decision record for the take-home. It is not meant to restate the assignment. It records the places where the brief leaves room for interpretation, the choices I have made so far, and the things I am deliberately not fixing yet.

The employer brief remains the source requirement. This document is my interpretation of it and is intended to be the contract the implementation works against.

## 1. Location input means a city or town

The public input remains a city/town string. I am not expanding the product into arbitrary places, coordinates, beaches, surf breaks, resorts, mountains or parks.

The awkward part is that the geocoder's taxonomy does not map perfectly onto ordinary language. In particular, "suburb" is not a category I can reliably infer myself. Some places a user would think of as suburbs may be classified by the provider as an ordinary populated place and therefore pass the same allowlist as a town; others may be classified as a subdivision and be rejected.

I am therefore using an explicit allowlist of populated-place feature codes rather than trying to build my own city/town/suburb classifier. The current accepted set is:

- `PPL`
- `PPLA`
- `PPLA2`
- `PPLA3`
- `PPLA4`
- `PPLA5`
- `PPLC`
- `PPLG`

Broad sections/subdivisions such as `PPLX`, grouped places such as `PPLS`, historical/abandoned/destroyed populated-place codes, `STLMT`, and non-populated geographic features are not accepted.

This means a real-world suburb can sometimes be accepted and sometimes not, depending on how the provider classifies it. I am comfortable with that limitation for this exercise. What I do not want is a growing body of provider-specific inference rules whose purpose is to guess whether a result "really" counts as a town.

Search still needs to consider the user's full query. A qualified query such as `Muizenberg, Western Cape` should be searched as such rather than reducing it to the first word and hoping the top result is close enough.

Where qualifiers are supplied, they are authoritative. If the provider cannot resolve a result matching them, the request should fail rather than silently falling back to a different place. For an unqualified but ambiguous name, the first accepted provider result is used and the fully resolved geography is returned so the caller can see what was selected.

The resolved provider location, not the raw search string, becomes the location identity used by the rest of the service.

## 2. "Rank" means ordinal suitability, not a forced league table

I am interpreting ranking as a qualitative assessment of how suitable each day is for each activity.

The public result vocabulary is:

`UNKNOWN`, `UNSUITABLE`, `POOR`, `FAIR`, `GOOD`, `EXCELLENT`

`POOR` through `EXCELLENT` are ordered. Ties are allowed. There is no requirement to manufacture a unique first through seventh place, and I do not want to expose a 0-100 score that suggests more precision than the weather heuristics can support.

Internal numeric values are fine if they make a heuristic easier to implement, but they are an implementation detail rather than part of the API contract.

The activity ratings are meant to be useful on their own terms. They are not a claim that, for example, a `GOOD` surfing day is mathematically comparable to a `GOOD` indoor-sightseeing day.

`UNKNOWN` is not a weak form of `POOR`. It means the service does not have enough trustworthy information to make the assessment. `UNSUITABLE` is an actual conclusion from the information we do have.

The detailed methodology for turning forecast observations into these outcomes belongs to the activity-scoring spike and is deliberately not fixed here.

## 3. The seven-day window is seven complete destination-local days

"Next seven days" is interpreted as the seven complete calendar days after the resolved location's current local day.

Today is excluded.

If it is 6 September in the resolved destination, the requested dates are 7-13 September regardless of the caller's timezone or the server's timezone.

I chose complete days because daily and day-derived metrics become misleading when part of the period has already happened. Introducing an arbitrary rule such as "today counts if at least 16 hours remain" creates a precise-looking boundary with no real product meaning. Scoring only the remaining part of today would be legitimate, but it would require a separate partial-day methodology and materially increase the scope.

All date-window reasoning is therefore based on the destination's local calendar.

## 4. Initial GraphQL result shape

The exact SDL can still be refined during implementation, but the intended result shape is simple:

- response metadata;
- the resolved location;
- the seven target dates;
- one aligned array of outcomes for each of the four activities.

Conceptually:

```text
metadata
location
dates[7]
skiing[7]
surfing[7]
outdoorSightseeing[7]
indoorSightseeing[7]
```

The arrays are aligned by date rather than independently sorted.

For the forecast-foundation spike, the activity outcomes can all be `UNKNOWN`. That lets the first spike establish the location, time-window, provider and forecast lifecycle contracts without pretending the activity methodology has already been decided.

The second spike can replace those placeholders with the real heuristic while retaining the same broad response contract.

## 5. Forecast coverage matters more than a magic provider request size

The service needs enough provider data to cover seven complete future destination-local dates, and a persisted snapshot should remain reusable across its freshness window where possible.

A rolling request of `forecast_hours=195` is currently a useful Open-Meteo adapter strategy. It gives enough horizon for the remainder of the current local day, seven complete following days, and the current three-hour freshness window.

The important decision is that **195 is not an application invariant**.

If the freshness policy changes later, or the provider changes how a rolling request behaves, the application does not become wrong because some unrelated piece of code assumes that 195 has special meaning. At worst, a snapshot stops being reusable sooner and is refreshed.

Correctness is still determined from the timestamps and observations actually
returned by the provider, but actual coverage does not determine whether a
successful fresh snapshot should be refreshed again.

Normal reuse is based on three separate concerns:

- the source response was successfully fetched and validated;
- the snapshot is still within the configured freshness window; and
- the snapshot was fetched for a requested horizon that still includes the
  current target window.

In other words:

normal reuse =
successful snapshot
&& fresh
&& request-window compatible

request-window compatible means that the snapshot's recorded
requestedThroughDate is on or after the last complete destination-local target
date required by the current request.

Actual returned coverage remains a separate concept. It determines source
metadata and whether activity-specific evidence is sufficient, but it does not
cause an otherwise fresh, window-compatible snapshot to be immediately
refetched.

A successfully validated partial or no-data response is therefore cached for
the normal freshness window. This avoids repeatedly calling a degraded provider
without inventing evidence that was not returned.

The requested horizon is an application-level concept: for the seven-day
product window, `requestedThroughDate` is the final complete target date. It is
not inferred from the last timestamp returned or from the configured
`forecast_hours` / `forecast_days` values.

The provider request strategy belongs inside the Open-Meteo adapter.

## 6. A "complete day" should be defined by usable local-date coverage, not exactly 24 records

I do not want to make "24 hourly timestamps" the structural definition of a valid day. That would turn daylight-saving transitions into false failures and would also make a single missing timestep automatically invalidate a day even where the eventual heuristic does not need that exact observation.

The useful invariant is that the service has sufficient meaningful observations for the local calendar day to evaluate the behaviour that depends on them.

The precise completeness rule is intentionally not being over-specified in the foundation spike because it depends partly on the activity heuristic. A DST day with 23 or 25 local hours should not be rejected merely because it is not 24 hours long.

Likewise, missing data should not be silently treated as a real weather value. Where required observations are absent, the affected assessment should degrade to `UNKNOWN` rather than inventing confidence.

The exact per-activity minimum data requirement belongs with the heuristic that consumes the data.

## 7. Partial provider coverage is best-effort, not all-or-nothing

Weather and marine data do not have identical availability and should not be made into one request-level success condition.

If ordinary weather data is usable but marine data is unavailable, the service can still assess the activities that depend only on weather. Surfing should become `UNKNOWN` for the unsupported dates rather than causing the entire request to fail.

The same principle applies to partial date coverage: return the outcomes that can be supported and represent unsupported conclusions honestly rather than treating the whole seven-day request as unusable.

This is deliberately best-effort behaviour, but not silent best effort. Response metadata should make stale or degraded data visible.

## 8. Stale data may be used as a bounded fallback

Fresh data is preferred. The normal freshness policy is currently three hours.

If a refresh fails and there is a previously persisted snapshot that is no more than 24 hours old, the service may use it as a stale fallback rather than fail the request immediately.

The stale snapshot still has to be judged against its real coverage. We should not claim a date is covered merely because the snapshot is recent.

If the stale snapshot can support only part of the requested window, the response should be best effort rather than pretending the missing part is current data. The exact GraphQL representation of an uncovered target date can be settled alongside the final response schema, but unsupported activity/date results should remain explicit rather than fabricated.

Data older than the fallback limit is not considered usable merely because it exists in storage.

## 9. Refresh is lazy and duplicate refreshes are coalesced in-process

There is no scheduled forecast refresh job for this exercise.

On request:

```text
resolve location
load snapshot
use it if fresh and sufficiently covered
otherwise refresh and persist
```

If several requests for the same resolved location arrive while a refresh is already in flight, they should await the same refresh rather than independently hammering Open-Meteo.

For this take-home I am assuming a single service instance. In-process single-flight/coalescing is therefore enough. Distributed locking or cross-instance refresh coordination would solve a deployment problem I am not claiming to solve here.

## 10. Snapshot retention

The service needs persisted forecasts to survive process restarts and support reuse/fallback. It does not currently need a historical weather archive.

Snapshots are over-written when a fresher one is fetched from the provider. Older snapshots are never merged into new ones to account for possible missing provider data.

## 11. Persistence lifecycle is decided before persistence payload

I initially planned persistence as part of the forecast-foundation slice. I deferred the final persisted forecast shape because it depends on which temporal observations the activity methodology actually requires. Spike 1 establishes snapshot identity, freshness and coverage semantics; Spike 2 will define the forecast data model before persistence is committed.

There are persistence semantics I can decide without knowing the activity methodology:

- a snapshot belongs to a canonical resolved location;
- it records when it was fetched;
- it records the coverage it actually contains;
- freshness and coverage determine normal reuse;
- a bounded stale fallback may be used after refresh failure;
- snapshots survive a service restart.

What I do **not** want to decide in the forecast-foundation spike is the final persisted forecast payload.

The activity heuristic may need daily aggregates, hourly observations, correlations between values at the same time, or some mixture of these. Choosing a heavily reduced schema before that methodology exists would make the database design dictate the product model.

The dependency I want is:

```text
activity semantics
    -> required forecast observations
    -> application forecast model
    -> persisted representation
```

rather than designing a persistence schema first and then forcing the heuristic to fit it.

The final payload shape is therefore deferred until the activity-scoring spike. This is a deliberate sequencing decision, not a decision to defer persistence itself.

## 12. Open-Meteo is an external boundary, not the application data model

Provider JSON should not leak through the service.

HTTP response bodies are treated as `unknown`, validated at runtime at the provider boundary, and then mapped into application-owned types. TypeScript alone cannot establish that an external response actually has the shape the code expects.

The intended flow is:

```text
Open-Meteo JSON
    -> runtime validation
    -> provider-specific DTO
    -> mapper
    -> application-owned forecast data
```

Zod is the current choice for runtime validation because it is small, familiar and makes the boundary explicit. The important decision is runtime validation and translation at the external boundary, not Zod as a product dependency in its own right.

I am not introducing a generic weather-provider abstraction. There is one known provider in the brief. A provider-specific client and mapper isolate the real source of volatility without inventing a framework for providers that do not exist.

## 13. Activity availability is outside the weather claim

The service ranks forecast suitability at the resolved location. It does not claim that the activity itself exists there.

Open-Meteo cannot tell us whether a ski resort exists, whether lifts are operating, whether a particular beach has a surfable break, or whether a museum is open. Adding those claims would require other datasets and a materially different product.

That means the language and heuristics need to stay within what the available data can support.

For surfing, marine data is based on the provider's marine forecast associated with the resolved location and should be treated as a coarse location-level proxy. A city such as Cape Town is not a single surf break.

For skiing in particular, the scoring methodology needs to avoid implying availability merely because skiing appears in the assignment. The exact weather-only rule is deliberately left to the activity-methodology spike.

## 14. Deliberate scope boundaries

For this take-home I am intentionally not solving:

- arbitrary geographic features or coordinates as input;
- surf-break selection;
- resort discovery or lift availability;
- attraction discovery/opening hours;
- user skill or preference profiles;
- distributed refresh coordination;
- model-aware provider refresh schedules;
- long-term forecast history and analytics;
- a general multi-provider weather framework;
- partial-current-day scoring.

These are real product or production concerns, but none of them needs to be solved to demonstrate the behaviour the brief asks for.

## 15. Deferred decisions

The main decisions still intentionally deferred to the activity-scoring spike are:

- the exact skiing, surfing, outdoor-sightseeing and indoor-sightseeing heuristics;
- which raw/hourly/daily observations those heuristics actually require;
- the final persisted forecast payload derived from those needs;
- exact per-activity rules for whether partial/missing observations are sufficient or require `UNKNOWN`;
- the final GraphQL SDL and detailed metadata fields;
- snapshot cleanup/retention policy beyond the fact that it is not required for the take-home.

Those should be settled when there is enough product information to make them real decisions rather than guesses.

## 16. Cross-activity scoring rules

The four activities have different temporal and meteorological semantics and should not be forced through one universal daily-weather score.

The shared pipeline is:

```text
validated provider observations
    -> canonical hourly forecast
    -> global conditions / source sufficiency
    -> activity-specific synthesis
    -> activity-specific heuristic
    -> categorical rating
```

The public rating vocabulary remains:

`UNKNOWN`, `UNSUITABLE`, `POOR`, `FAIR`, `GOOD`, `EXCELLENT`

Internal numeric scores may be used where useful, but they remain implementation details. Activity scoring may also use explicit caps and vetoes where arithmetic compensation would produce misleading results.

### Source coverage is not activity-data sufficiency

Spike 1 deliberately uses a weak source-coverage rule: a target date is covered when at least one requested representative observation has a usable value on that date.

That is sufficient for establishing provider and lifecycle behaviour, but it is not sufficient evidence for every activity.

Spike 2 must separately determine whether each activity has enough of the right observations, over enough of the relevant period, to justify a rating.

Therefore:

```text
source coverage
    !=
activity-data sufficiency
```

Missing observations must not be interpreted as favourable weather.

Where the evidence required by an activity cannot be established reliably, the result is `UNKNOWN`.

### Global extreme-weather override

Before ordinary activity scoring, the service applies a narrow global extreme-weather override.

Where forecast conditions are sufficiently severe that discretionary travel or recreation should not reasonably be recommended, all four activities are rated:

`UNSUITABLE`

This includes indoor sightseeing because indoor activities normally still require travel to and from the venue.

The initial global override conditions are:

- **Extreme wind:** wind gusts of at least **93 km/h / 26 m/s** during a relevant period.
- **Blizzard-like conditions:** at least three consecutive relevant hours containing:
  - snowfall greater than zero;
  - visibility at or below **400 m**; and
  - wind gusts of at least **56 km/h / 15.6 m/s**.
- **Heavy freezing rain:** WMO weather code **67** during a relevant period.
- **Extreme heat:** apparent temperature of at least **45 °C** for at least two consecutive relevant daytime hours.
- **Extreme cold:** apparent temperature of at most **−30 °C** for at least two consecutive relevant daytime hours.
- **Thunderstorm with heavy hail:** WMO weather code **99**, where supplied by the forecast model.

These are conservative product thresholds informed by severe-weather criteria. They are not represented as official warnings.

The service does not attempt to infer tornadoes, flash flooding, cyclone warnings, avalanche risk, wildfire conditions, road closures or other hazards that require authoritative alerts or additional domain-specific information.

Absence of the global override is therefore not a declaration that an activity is safe.

### High temperature below the global threshold

Apparent temperature below **45 °C** does not make every activity globally unsuitable.

Instead, high temperature is handled by the individual activity heuristics.

Outdoor sightseeing should degrade strongly as sustained heat increases. Skiing and surfing handle heat within their own activity contexts. Indoor sightseeing should normally remain viable below the global threshold.

### Local climate

The initial implementation will use broad absolute comfort ranges rather than normalising ratings against the destination's historical climate.

A temperature does not become comfortable merely because it is normal for that location.

Thermal comfort is affected by acclimatisation, but the API has no information about traveller origin or acclimatisation.

A future implementation could use historical climate information as a bounded modifier. Such a modifier must never override absolute hazard or severe-discomfort rules.

### Activity-specific temporal synthesis

There will be no single universal `dailyWeatherSummary`.

Different activities consume the same canonical forecast differently:

- outdoor sightseeing cares about meaningful comfortable outdoor windows;
- surfing cares about simultaneous marine and weather conditions and discrete sessions;
- skiing cares about snow viability and sustained daytime conditions;
- indoor sightseeing is derived largely from the availability of better weather-dependent alternatives.

This is an intentional domain boundary.

## 17. Outdoor sightseeing

### Activity semantics

The outdoor-sightseeing rating means:

> **How suitable is this day for spending several hours sightseeing outdoors in the resolved location?**

It is a meteorological suitability assessment only.

It does not account for attraction availability, transport disruption, crime, air quality, wildfire conditions, official warnings or other non-weather factors.

### Research basis

HCI:Urban is used as an evidence-based reference for the main meteorological dimensions associated with urban sightseeing.

The implementation does not reproduce the HCI formula or its exact weights.

Instead it adopts the broad importance of:

- thermal comfort;
- precipitation;
- wind;
- aesthetic/visibility conditions;

while adapting them to hourly forecast data, meaningful contiguous activity periods, categorical output and explicit non-compensable conditions.

### Activity period

Ordinary outdoor-sightseeing conditions will initially be evaluated during approximately:

`08:00–18:00 local time`

Overnight weather is not used as ordinary comfort input.

The global extreme-weather layer may consider a wider period where conditions outside this window materially affect travel or recreation.

### Meaningful sightseeing windows

Outdoor sightseeing is treated as a **window-finding problem**, rather than as a daily-average problem.

The initial model will look for approximately **three-hour contiguous sightseeing periods** within the activity window.

A brief excellent hour is not enough to make the whole day excellent, while several good hours should not be obscured by poor weather later in the day.

The exact rolling-window implementation belongs to Spike 2.

### Primary dimensions

The initial model should principally use:

- apparent temperature;
- precipitation;
- snowfall;
- wind speed;
- wind gusts;
- visibility;
- weather code.

Cloud cover may be included as a weak aesthetic modifier, but overcast conditions alone should not materially downgrade an otherwise good sightseeing period.

### Thermal comfort

Thermal comfort should use broad absolute ranges rather than a narrow assumed ideal.

Representative conditions matter more than isolated hourly spikes.

For each candidate window the synthesis should preserve enough information to distinguish representative temperature from extremes, for example:

- median apparent temperature;
- minimum apparent temperature;
- maximum apparent temperature.

The exact temperature bands and rating boundaries are deferred to Spike 2 calibration.

### Precipitation

Precipitation should be interpreted from its temporal shape rather than only from total accumulation.

The model should be able to distinguish:

- a brief shower;
- intermittent light rain;
- persistent drizzle;
- sustained moderate or heavy rain.

Useful synthesis therefore needs information about:

- duration;
- intensity;
- accumulation;
- persistence.

A short shower should not necessarily make an otherwise good sightseeing day poor.

Conversely, ideal temperature must not allow sustained heavy rain to score highly through simple weighted averaging.

### Snowfall

Snowfall is not automatically bad sightseeing weather.

Light snow combined with reasonable temperature, visibility and wind may still produce a good outdoor period.

Persistent or heavy snowfall should increasingly reduce suitability, particularly where visibility or wind also deteriorate.

Severe snow/wind/visibility combinations are handled by the global extreme-weather override.

### Wind

Ordinary sightseeing comfort should primarily use representative sustained wind, while gusts remain important for hazard or cap logic.

The model should distinguish:

- representative wind;
- duration of stronger wind;
- exceptional gusts.

Exact ordinary wind thresholds belong to Spike 2 calibration.

### Visibility

Visibility should retain both representative conditions and significant low-visibility periods.

Persistent poor visibility can strongly reduce sightseeing value even when temperature and precipitation are otherwise favourable.

### Scoring and aggregation

Outdoor sightseeing may use an internal numeric score for each candidate window, with thermal comfort and precipitation carrying the greatest influence.

The precise weights are not fixed in this decision record.

The model must support caps and vetoes so that unacceptable conditions cannot be hidden by strong scores in other dimensions.

The final daily rating should consider both:

1. the quality of the best meaningful sightseeing window; and
2. how much useful outdoor time exists during the day.

The exact conversion to `POOR` through `EXCELLENT` is a Spike 2 calibration decision.

## 18. Surfing

### Activity semantics

Surfing is treated as a **session-finding activity**.

The rating means approximately:

> **How favourable are the forecast marine and meteorological conditions for finding a worthwhile recreational surfing session in the resolved coastal area?**

The result is a coarse city/area-level estimate.

It does not establish:

- that a surf break exists;
- that a particular break will work;
- that the conditions are safe for every surfer;
- that the surfer has the required skill;
- that swell direction, wind direction or tide suit a specific break.

An `EXCELLENT` surfing result therefore means excellent broad marine/weather potential, not a break-specific safety recommendation.

### Research basis

Surfing research supports wave height, wave period and wind as meaningful inputs to recreational surf quality.

It also strongly supports the limitation that suitable surf depends on:

- surfer ability;
- local bathymetry;
- coastline orientation;
- characteristics of the individual break.

For that reason the implementation uses broad marine/weather evidence without pretending to model break-specific conditions.

### Temporal alignment

Marine and weather observations must be aligned by timestamp before scoring.

Surfing must not combine unrelated daily extrema such as the day's maximum wave height, maximum period and maximum wind if they occurred at different times.

The relevant question is the simultaneous condition:

```text
wave state
+
wave period
+
wind
+
weather hazards
```

at the same point in time.

### Surfing period

Surfing is not restricted to the outdoor-sightseeing window.

The initial surf-access period will be approximately:

```text
sunrise - 90 minutes
through
sunset + 60 minutes
```

This allows realistic dawn and dusk opportunities without allowing excellent middle-of-the-night marine conditions to define the day's recreational rating.

The exact offsets may be calibrated during Spike 2.

### Primary dimensions

The initial surf model should principally use:

1. wave or swell height;
2. wave or swell period;
3. wind speed.

Weather hazards may separately veto a surfing period.

Air temperature and sea-surface temperature may provide weak comfort information but should not dominate marine suitability.

### Wave height

Wave height is not monotonic.

Larger waves must not automatically produce a better rating.

Because the API has no surfer-skill input, the model should favour a broad recreational range and degrade again when surf becomes excessively large or powerful.

Exact bands are a Spike 2 calibration decision.

### Wave period

Wave period is a consequential quality input.

Longer-period swell will generally improve broad surf potential relative to short-period wind chop, but there is no universal research-supported category boundary such as a fixed number of seconds automatically meaning `GOOD`.

Exact mappings therefore remain calibrated product heuristics.

### Wind

Wind speed should progressively affect surf quality.

Wind direction is deliberately excluded from the initial city-level model because whether wind is offshore, cross-shore or onshore depends on the orientation of the actual break.

### Swell direction

Swell direction is excluded for the same reason.

Without knowledge of coastline orientation, bathymetry and break geometry, raw swell direction has no reliable generic positive or negative interpretation.

### Tide

Tide is initially excluded.

There is no generic "good tide"; different breaks favour different tidal states.

Without a surf-break model, translating modelled sea level into suitability would add apparent sophistication without defensible meaning.

### Currents

Modelled ocean currents are also excluded from the initial rating.

Current velocity may have safety relevance, but the service lacks enough break geometry, bathymetry and surfer-skill context to convert broad current forecasts into trustworthy recommendations.

### Surfing opportunities

A useful surfing opportunity must be a contiguous period long enough to constitute a realistic session.

The initial minimum is approximately **two hours**.

Hourly conditions should first be assessed for basic surfability. The implementation should then identify **maximal contiguous runs of sufficiently usable conditions**.

Overlapping windows from the same favourable period must not be treated as separate opportunities.

For example:

```text
05:00–07:00 EXCELLENT
06:00–08:00 EXCELLENT
```

represent one underlying morning opportunity, not two independent opportunities.

### Best two discrete opportunities

The daily surf synthesis should retain the **two strongest genuinely distinct surfing opportunities**.

The final rating should be driven primarily by:

1. the quality of the best opportunity;
2. the quality of the second-best opportunity;
3. the duration of the opportunities.

The best and second-best ratings should not simply be averaged.

The first opportunity establishes how good surfing can become; the second opportunity and available duration indicate how strongly the whole day deserves that rating.

The exact daily aggregation rule belongs to Spike 2 calibration.

### `POOR`, `UNSUITABLE` and `UNKNOWN`

`POOR` means conditions appear technically surfable but unattractive.

`UNSUITABLE` means the available evidence supports not recommending surfing, for example:

- no meaningful marine surf conditions;
- excessively large/powerful surf for the generic recreational model;
- activity-specific hazardous conditions;
- the global extreme-weather override.

`UNKNOWN` means there is insufficient trustworthy evidence.

Provider failure must not become `UNSUITABLE`.

### Inland and non-applicable locations

A successful marine response containing consistently no usable marine observations across the relevant forecast window can be evidence that marine surfing is not applicable at that resolved location.

Marine non-applicability is inferred only from consistent absence across the full fetched marine horizon used by the service, currently roughly eight days of evidence. A single target date, or a partial run of null marine observations, is not sufficient to establish structural non-applicability.

If the full successfully validated marine dataset contains no usable required marine observations, surfing may be treated as structurally UNSUITABLE. Provider failure or partial/inconclusive marine coverage remains UNKNOWN.

That may support `UNSUITABLE`.

A failed marine request or incomplete evidence instead supports `UNKNOWN`.

This preserves the existing distinction between `NO_DATA` and `UNAVAILABLE`.

### Architectural boundary

Surfing follows:

```text
canonical hourly weather
        +
canonical hourly marine observations
        ↓
timestamp alignment
        ↓
surf-specific hourly synthesis
        ↓
discrete surf opportunities
        ↓
best two opportunities
        ↓
daily surfing rating
```

## 19. Skiing

### Activity semantics

Skiing is treated as a **sustained daytime activity**.

The rating means approximately:

> **How suitable are the forecast snow and weather conditions for undertaking a substantial daytime skiing session at the resolved location?**

It is a meteorological suitability estimate only.

It does not establish:

- that a resort exists;
- that lifts or pistes are operating;
- that nearby mountain slopes have the same forecast as the resolved town;
- that artificial snow exists;
- that avalanche conditions are safe;
- that access roads are open.

An `EXCELLENT` rating therefore means excellent meteorological potential given the available snow/weather evidence, not confirmation that skiing is actually available.

### Research basis

Ski-tourism research supports treating snow reliability as a prerequisite and then evaluating weather comfort using factors such as:

- snowfall and visibility;
- wind;
- temperature;
- cloud/aesthetic conditions.

The implementation uses those variables and relative priorities rather than reproducing a published ski index exactly.

### Snow is a prerequisite

Snow availability is not simply another weighted comfort factor.

Excellent temperature, wind and visibility must not produce a high skiing score when there is no credible snow evidence.

The evaluation therefore begins with:

1. snow viability; then
2. skiing-weather quality.

### Snow depth

Open-Meteo `snow_depth` is useful evidence of natural snow at the modelled location, but it is not equivalent to piste snow depth.

It does not establish:

- groomed depth;
- artificial snow;
- conditions at a higher-altitude nearby resort;
- snow distribution across terrain.

Published thresholds such as approximately 30 cm may inform calibration, but will not be implemented as a universal binary cutoff.

The initial model will use broad snow-viability bands.

### No elevation heuristic

There will be no generic minimum-elevation rule.

A rule such as:

```text
elevation < 1000m
→ UNSUITABLE
```

would fail across different latitudes and climates and would be especially misleading for city inputs below nearby ski terrain.

Observed snow/weather evidence is preferred over an arbitrary altitude proxy.

### No snow versus unknown snow

Evidence of absence must remain distinct from absence of evidence.

If valid forecast data establishes effectively no useful snow and there is no relevant fresh snowfall that changes that conclusion, skiing may be `UNSUITABLE`.

If snow-state observations needed to establish viability are missing or unavailable, the result should be `UNKNOWN`.

Provider failure likewise produces `UNKNOWN`.

### Activity period

Ordinary skiing will initially be evaluated during approximately:

`08:00–17:00 local time`

This is a proxy for a conventional ski day, not a claim about lift operating hours.

### Preceding conditions

Conditions immediately before the daytime period may contribute useful snow context.

For example:

- overnight snowfall may improve snow availability;
- overnight rain or warmth may degrade marginal snow.

The initial implementation will not attempt a sophisticated snowpack simulation.

Reported snow depth remains the main snow-state evidence.

### Sustained skiing opportunity

Skiing should not receive a high daily rating because of one or two isolated favourable hours.

The initial model treats approximately **four contiguous usable hours** as the minimum meaningful high-quality skiing opportunity.

The exact duration may be calibrated, but the product invariant is:

> **A brief favourable interval is insufficient to make a ski day highly rated.**

### Continuity

One sustained period is more useful than the same number of disconnected favourable hours.

The synthesis should therefore retain information such as:

- longest usable contiguous run;
- quality of the best sustained period;
- proportion of the nominal ski day that remains usable.

### Primary dimensions

The initial skiing model should principally use:

1. snow availability / snow depth;
2. snowfall and visibility;
3. wind;
4. temperature;
5. optionally cloud cover as a weak aesthetic modifier.

### Temperature

Air temperature and apparent temperature have different roles.

Air temperature is useful for snow-state context and melt/rain risk.

Apparent temperature may be used as a secondary human-comfort input.

Conditions around freezing are broadly favourable for ordinary skiing, but exact temperature bands remain calibration decisions.

Very warm temperatures should interact with snow availability rather than acting independently.

### Snowfall

Snowfall is not automatically bad.

Brief or light snowfall may be neutral or favourable where existing snow, visibility and wind remain good.

Persistent or heavy snowfall should increasingly degrade skiing conditions, especially where visibility deteriorates.

### Rain and freezing rain

Rain should strongly degrade skiing because it affects comfort and snow quality.

Freezing rain is more severe and may trigger an activity-specific veto or the global extreme-weather override.

### Visibility

Visibility is an explicit skiing input.

Persistent poor visibility should strongly cap skiing suitability even where snow and temperature are otherwise favourable.

Very low visibility combined with snowfall and wind may trigger the global blizzard-like override.

### Wind

Wind is one of the stronger skiing comfort variables.

Representative wind and duration of stronger wind should affect ordinary scoring, while maximum gusts remain available for cap or hazard logic.

Exact bands remain Spike 2 calibration decisions.

### Cloud cover

Cloud cover should have relatively little influence.

An overcast day with good snow, visibility, temperature and light wind can still be a very good ski day.

Cloud cover should therefore be a weak aesthetic modifier at most.

### Scoring and daily aggregation

Skiing may use internal numeric scoring combined with prerequisite logic, caps and vetoes.

The final daily rating should consider at least:

1. snow viability;
2. quality of the best sustained skiing period;
3. length of the longest usable contiguous period;
4. proportion of the conventional ski day that remains usable.

The final category should not simply be the best hourly value or the arithmetic mean of every hour.

### `POOR`, `UNSUITABLE` and `UNKNOWN`

`POOR` means skiing appears meteorologically possible but unattractive.

`UNSUITABLE` means available evidence indicates skiing should not be recommended, for example:

- effectively no usable snow;
- no meaningful sustained skiable period;
- severe icing or activity-specific hazardous conditions;
- global extreme-weather override.

`UNKNOWN` means there is insufficient trustworthy evidence to determine snow viability or skiing conditions.

### Architectural boundary

Skiing follows:

```text
canonical hourly weather
        ↓
snow viability/context
        ↓
local skiing-period observations
        ↓
ski-specific hourly/window synthesis
        ↓
best sustained opportunity
        +
overall usable proportion
        ↓
daily skiing rating
```

## 20. Indoor sightseeing

Indoor sightseeing intentionally uses a much simpler weather model.

### Activity semantics

The rating means:

> **How suitable is the day for choosing indoor sightseeing, based only on weather and the opportunity cost of giving up better outdoor activities?**

It does not assess attraction availability, opening hours, tickets, transport, venue quality or whether indoor attractions exist.

### Default rating

Indoor sightseeing is:

`GOOD`

by default whenever the global extreme-weather override does not apply.

Ordinary rain, cold, heat below the global threshold, cloud, poor visibility, snow and moderate wind do not directly downgrade indoor sightseeing.

### Global override

If the global extreme-weather override applies:

`INDOOR_SIGHTSEEING = UNSUITABLE`

because discretionary travel itself should not be encouraged.

### Opportunity-cost boost

Indoor sightseeing may become:

`EXCELLENT`

when weather has removed all meaningful high-quality outdoor alternatives.

This does not mean that bad weather makes a museum intrinsically better.

It means the weather makes indoor sightseeing the strongest available weather-based choice.

Conceptually:

```text
if globalExtremeWeather:
    indoor = UNSUITABLE

else if no meaningful GOOD or EXCELLENT
        weather-dependent outdoor opportunity exists:
    indoor = EXCELLENT

else:
    indoor = GOOD
```

### Structural non-applicability does not count

An activity being structurally unavailable at the location must not contribute to the opportunity-cost boost.

For example, an inland city should not receive `EXCELLENT` indoor sightseeing every day merely because surfing is not applicable.

Likewise, lack of snow should not automatically improve indoor sightseeing if the outdoor-sightseeing weather is otherwise good.

The boost depends on outdoor opportunities being weak **because of the forecast**, not merely because an activity is unavailable at that location.

### Dependency on synthesized activity results

Indoor sightseeing should not independently inspect raw weather.

It should consume the already-synthesized results of:

- skiing;
- surfing;
- outdoor sightseeing;

along with enough internal reason information to distinguish weather-driven weakness from structural non-applicability or missing evidence.

The implementation therefore needs a small internal reason model, for example:

```ts
type ActivityAssessment = {
  rating: Rating;
  reasonCategory: ReasonCategory;
};
```

The exact representation is not part of the public API.

### Rating vocabulary

Indoor sightseeing will not normally use `FAIR` or `POOR` in the initial model.

Its expected weather-derived outcomes are:

- `EXCELLENT`;
- `GOOD`;
- `UNSUITABLE`;
- `UNKNOWN` where the broader assessment cannot be made reliably.

### Scoring order

The activity dependency order is:

1. global extreme-weather override;
2. skiing;
3. surfing;
4. outdoor sightseeing;
5. indoor sightseeing.

Indoor sightseeing is intentionally a derived activity rating.

### Final v1 rule

> **Indoor sightseeing is `GOOD` by default, `UNSUITABLE` under the global extreme-weather override, and `EXCELLENT` when weather has removed all meaningful `GOOD` or `EXCELLENT` outdoor opportunities. Structural non-applicability of skiing or surfing does not contribute to the `EXCELLENT` boost.**

## 21. Calibration and detailed scoring remain Spike 2 decisions

The sections above define the consequential activity semantics and architectural boundaries.

Spike 2 still needs to turn those decisions into an executable scoring contract.

The remaining calibration work includes:

- the final application-owned observation set;
- exact per-activity data-sufficiency rules;
- exact thermal comfort bands below the global thresholds;
- precipitation intensity/duration bands;
- ordinary wind and visibility bands;
- wave-height and wave-period bands;
- ski snow-viability bands;
- numeric scoring weights where numeric scoring is useful;
- rating caps and activity-specific veto thresholds;
- exact category boundaries;
- exact daily aggregation rules;
- representative scenario tests used to calibrate those rules.

These should be settled against explicit examples rather than chosen because they produce aesthetically neat numbers.

The sequence remains:

```text
activity semantics
    -> required observations
    -> activity-specific synthesis
    -> calibrated heuristic
    -> application forecast model
    -> persisted representation
```

The persisted forecast payload should therefore still not be finalised until the observation and synthesis requirements are clear.

## 23 Advisory output — accepted direction, implementation deferred

Activity ratings will remain coarse and will not expose detailed reasons for ordinary scoring outcomes.

The final assessment should additionally expose sparse advisories where a categorical rating alone omits materially important interpretation context.

Current intended advisory semantics are:

- date-scoped advisories preserving the specific trigger for the global extreme-weather override, including extreme wind, blizzard-like conditions, heavy freezing rain, extreme heat, extreme cold and heavy-hail thunderstorm;
- date-scoped SKIING_NO_SNOW when the skiing prerequisite is affirmatively absent;
- date-scoped LARGE_SURF or NO_SURF where the recreational-surfer recommendation envelope is exceeded;
- forecast/location-scoped SURFING_NOT_APPLICABLE when the full successful marine horizon establishes structural marine non-applicability.

These are not general score explanations. Internal assessment classifications remain distinct from public advisories.

The exact GraphQL shape, persisted representation, deduplication/aggregation rules and implementation are deliberately deferred to Spike 003, when the final assessment and durable snapshot model are defined.

This decision does not change the current Spike 002 calibration oracle and is not part of the evaluator-driven evidence-sufficiency repair.

## 22. Evidence and references

The activity methodology is informed by published work, but the service does not claim to implement any cited index verbatim.

The research is used primarily to identify consequential variables, understand their relative importance and expose the limits of what can responsibly be inferred from generic forecast data.

### Outdoor sightseeing

HCI:Urban is used as the principal evidence base for the importance of thermal comfort, precipitation, wind and aesthetic conditions in urban tourism.

The implementation adapts those dimensions to hourly contiguous sightseeing windows rather than reproducing the published index formula or weights.

### Surfing

Barlow, M.J., Gresty, K., Findlay, M., Cooke, C.B. & Davidson, M.A. (2014). _The effect of wave conditions and surfer ability on performance and the physiological response of recreational surfers._ Journal of Strength and Conditioning Research, 28(10), 2946–2953. DOI: 10.1519/JSC.0000000000000491.

Boqué Ciurana, A. & Aguilar, E. (2021). _Which Meteorological and Climatological Information Is Requested for Better Surfing Experiences? A Survey-Based Analysis._ Atmosphere, 12(3), 293. DOI: 10.3390/atmos12030293.

Espejo, A., Losada, I.J. & Méndez, F.J. (2014). _Surfing wave climate variability._ Global and Planetary Change, 121, 19–25. DOI: 10.1016/j.gloplacha.2014.06.006.

Hutt, J.A., Black, K.P. & Mead, S.T. (2001). _Classification of Surf Breaks in Relation to Surfing Skill._ Journal of Coastal Research, Special Issue 29, 66–81.

### Skiing

Kapetanakis, D., Georgopoulou, E., Mirasgedis, S. & Sarafidis, Y. (2022). _Weather Preferences for Ski Tourism: An Empirical Study on the Largest Ski Resort in Greece._ Atmosphere, 13(10), 1569. DOI: 10.3390/atmos13101569.

Demiroglu, O.C., Turp, M.T., Kurnaz, M.L. et al. (2021). _The Ski Climate Index (SCI): fuzzification and a regional climate modeling application for Turkey._ International Journal of Biometeorology, 65, 763–777. DOI: 10.1007/s00484-020-01991-0.

Demiroglu, O.C. et al. (2020). _Overloaded! Critical revision and a new conceptual approach for snow indicators in ski tourism._ International Journal of Biometeorology.

### Provider documentation

Open-Meteo Weather Forecast API documentation is used as the source reference for available hourly weather observations.

Open-Meteo Marine Weather API documentation is used as the source reference for available hourly wave, swell, period, sea-surface-temperature, tide and current observations.

Provider availability does not by itself imply that every available variable is appropriate for the product heuristic.
