# Spike 002 — Activity Methodology and Scoring

## Parent contract and authority

This spike inherits `../../brief.md`.

The employer brief in `../../source-brief.md` remains the source requirement.

This spike also explicitly operationalises the activity-methodology decisions recorded in `../../decisions.md`, especially the sections covering:

- cross-activity scoring rules;
- outdoor sightseeing;
- surfing;
- skiing;
- indoor sightseeing; and
- calibration deferred to Spike 002.

`decisions.md` remains supporting product and engineering rationale. The concrete rules in this spike brief are the executable contract for Spike 002. If this spike makes a calibration choice more exact than the decision record, this spike governs Spike 002 implementation. The source brief and root product brief still take precedence if there is a contradiction.

Spike 001 established the location, destination-local date window, provider boundaries, source-state semantics, lifecycle policy, GraphQL skeleton and in-process refresh coalescing.

This spike replaces the activity-rating placeholders with a real weather-suitability methodology and establishes the application forecast model that Spike 003 will persist.

## Goal

Given the seven destination-local target dates and validated Open-Meteo weather/marine observations, produce a categorical suitability rating for each activity on each date:

- skiing;
- surfing;
- outdoor sightseeing;
- indoor sightseeing.

This spike must also establish:

- the final weather and marine observations required by v1 scoring;
- the application-owned hourly/daily forecast representation needed by the heuristics;
- the distinction between source coverage and activity-data sufficiency;
- activity-specific temporal synthesis;
- missing-data behaviour;
- explicit global and activity-specific caps/vetoes;
- representative scenario tests that make the calibrative parts of the heuristic reviewable.

Durable persistence and request-time snapshot reuse remain deferred to Spike 003.

---

## Public rating semantics

The public rating vocabulary remains:

- `UNKNOWN`
- `UNSUITABLE`
- `POOR`
- `FAIR`
- `GOOD`
- `EXCELLENT`

`POOR` through `EXCELLENT` are ordinal suitability levels.

`UNKNOWN` means the service lacks enough trustworthy evidence to make the assessment.

`UNSUITABLE` is an affirmative conclusion from available evidence.

Missing or failed provider data must not become `UNSUITABLE` merely because the service cannot evaluate an activity.

Internal numeric scores are allowed where they simplify calibration or aggregation, but the GraphQL API continues to expose only the categorical rating.

---

## Shared scoring architecture

The activities must not be forced through one universal daily summary.

The shared pipeline is:

```text
validated Open-Meteo DTOs
        ↓
application-owned canonical forecast
        ↓
global extreme-weather assessment
        ↓
activity-specific data sufficiency
        ↓
activity-specific temporal synthesis
        ↓
activity-specific scoring / caps / vetoes
        ↓
daily categorical activity rating
```

The application forecast model must preserve timestamp alignment. It must not reduce the provider response to unrelated daily extrema before activities have had the opportunity to synthesize the hourly data they need.

### Source coverage is not activity-data sufficiency

Spike 001 source metadata deliberately uses a weak source-coverage rule:

> A target date is covered by a source when at least one requested representative observation on that date contains a usable non-null value.

That source-level definition remains unchanged in this spike.

It does **not** mean the source contains enough information to score an activity.

Spike 002 introduces a separate activity-data-sufficiency decision:

```text
source coverage
    !=
enough evidence to rate an activity
```

Each activity must decide whether enough of its required observations exist over enough of its relevant activity period to justify a rating.

A DST day must not be rejected merely because it contains 23 or 25 local hourly records. Sufficiency is based on the actual local activity period and usable observations, not a fixed assumption of 24 records per calendar date.

### Baseline missing-data rule

A candidate activity window is scorable only when the observations required for that window are sufficiently present and aligned.

Missing values must never be treated as favourable values or silently replaced with zero.

The exact minimum-coverage percentages are calibrative, but the initial implementation should use the following principle:

- a positive rating may be supported by a complete meaningful activity window even if unrelated hours are missing;
- a negative conclusion such as "there was no meaningful usable window" requires enough coverage of the relevant activity period to make absence credible;
- where neither a positive opportunity nor a credible negative conclusion can be established, return `UNKNOWN`.

The calibration document must make the exact per-activity sufficiency checks explicit before evaluator preparation.

---

## Canonical v1 forecast observations

The application selects the observations required by the activities. The Open-Meteo adapter owns translation to provider field names and runtime validation.

Provider field names must not leak into scoring code.

### Weather observations

The v1 weather model requires enough application-owned observations to represent:

- air temperature;
- apparent temperature;
- precipitation;
- rain;
- snowfall;
- snow depth;
- sustained wind speed;
- wind gust;
- visibility;
- weather code;
- cloud cover;
- daily sunrise;
- daily sunset.

Cloud cover is a weak/optional scoring input, but it may be retained because it is inexpensive once weather data is already being fetched.

Sunrise and sunset are required for defining the surfing access period. They should be obtained through the existing Open-Meteo weather request rather than through a new astronomy dependency or separate external provider.

### Marine observations

The v1 surf model requires:

- total wave height;
- swell period;
- total/combined wave period.

The initial implementation does **not** require:

- swell direction;
- wind direction relative to the coast;
- tide;
- modelled currents;
- swell height;
- break-specific marine data.

Wind speed used for surfing comes from the aligned ordinary weather forecast.

### Period relationship

`SwellPeriod` is the primary positive period signal.

`WavePeriod` is retained as a supporting sea-state signal rather than simply receiving another "longer is better" score.

Where combined wave period is materially shorter than swell period, the surf heuristic may apply a small degradation or cap because the relationship can indicate a mixed or short-period sea state rather than clean organised swell.

The exact delta or ratio is calibrative.

This signal must not be given enough weight to double-count strong wind excessively: wind speed and a choppy period relationship may reflect related physical conditions.

### Application model boundary

A reasonable application shape may resemble:

```ts
type WeatherObservation = {
  time: LocalDateTime;
  airTemperature?: number;
  apparentTemperature?: number;
  precipitation?: number;
  snowfall?: number;
  snowDepth?: number;
  windSpeed?: number;
  windGust?: number;
  visibility?: number;
  weatherCode?: number;
  cloudCover?: number;
};

type MarineObservation = {
  time: LocalDateTime;
  waveHeight?: number;
  swellPeriod?: number;
  wavePeriod?: number;
};

type SolarDay = {
  date: LocalDate;
  sunrise?: LocalDateTime;
  sunset?: LocalDateTime;
};
```

The exact TypeScript representation is implementation-owned.

The invariant is that activity code consumes application-owned, timestamp-aligned observations rather than Open-Meteo arrays or provider field names.

---

## Global extreme-weather override

The service applies a narrow global extreme-weather override before ordinary activity scoring.

If forecast evidence is sufficiently severe that discretionary travel or recreation should not reasonably be recommended, all four activities are:

`UNSUITABLE`

This includes indoor sightseeing because indoor activities normally still require travel.

### Global evaluation period

The global override is evaluated over approximately:

`06:00–22:00 local time`

Bad weather in the middle of the night should not automatically invalidate an otherwise usable day.

Activity-specific models may still inspect overnight conditions where relevant. Skiing, for example, may inspect preceding snowfall or warmth as snow context without treating that as a global day veto.

### Global override conditions

The initial global thresholds are:

#### Extreme wind

Any relevant observation with wind gust:

`>= 93 km/h / 26 m/s`

#### Blizzard-like conditions

At least three consecutive relevant hours containing all of:

- snowfall greater than zero;
- visibility `<= 400 m`;
- wind gust `>= 56 km/h / 15.6 m/s`.

#### Heavy freezing rain

Relevant WMO weather code:

`67`

#### Extreme heat

Apparent temperature:

`>= 45 °C`

for at least two consecutive relevant hours.

#### Extreme cold

Apparent temperature:

`<= -30 °C`

for at least two consecutive relevant hours.

#### Thunderstorm with heavy hail

Relevant WMO weather code:

`99`

where that code is available from the forecast model.

### Meaning and limitation

These are conservative product heuristics informed by severe-weather criteria.

They are **not official warnings**.

The service must not invent authoritative conclusions about:

- tornadoes;
- flash flooding;
- cyclone warnings;
- avalanche conditions;
- wildfire risk;
- road closures;
- civil warnings;
- other hazards requiring data that Open-Meteo does not provide here.

Absence of the global override is not a declaration that conditions are safe.

### Heat below the global threshold

Heat below `45 °C` apparent temperature is handled by the individual activity model.

It must not automatically make every activity unsuitable.

---

# Outdoor sightseeing

## Activity semantics

The outdoor-sightseeing rating means:

> How suitable is this day for spending several hours sightseeing outdoors in the resolved location?

It is a meteorological suitability assessment only.

It does not assess:

- attraction availability;
- transport disruption;
- crime;
- air quality;
- wildfire conditions;
- official alerts;
- other non-weather hazards.

## Research influence

HCI:Urban is used as an evidence base for the importance of:

- thermal comfort;
- precipitation;
- wind;
- aesthetic conditions.

The implementation must not claim to reproduce HCI:Urban or expose its formula.

The v1 heuristic adapts those dimensions to:

- hourly data;
- contiguous activity windows;
- explicit caps/vetoes;
- categorical output;
- visibility as an explicit useful dimension.

## Activity period

Ordinary outdoor sightseeing is evaluated over:

`08:00–18:00 local time`

The exact implementation must use destination-local timestamps.

## Meaningful window

Outdoor sightseeing is a **window-finding problem**.

The initial meaningful sightseeing window is approximately:

`3 contiguous hours`

The implementation may use rolling three-hour candidate windows inside the activity period.

A single excellent hour is insufficient to make the day `EXCELLENT`.

Several good contiguous hours must not be hidden by poor weather later in the day.

## Core dimensions

Outdoor scoring uses:

- apparent temperature;
- precipitation;
- snowfall;
- sustained wind speed;
- wind gust for cap/hazard logic;
- visibility;
- weather code.

Cloud cover may be used as a weak aesthetic modifier only.

## Thermal calibration baseline

Representative conditions should use median apparent temperature for ordinary comfort, while minimum/maximum values remain available for extreme checks.

The initial calibration baseline is:

| Apparent temperature   | Starting category/effect                                 |
| ---------------------- | -------------------------------------------------------- |
| 18–27 °C               | `EXCELLENT` baseline                                     |
| 12–<18 °C or >27–32 °C | `GOOD` baseline                                          |
| 5–<12 °C or >32–36 °C  | `FAIR` baseline                                          |
| 0–<5 °C or >36–40 °C   | `POOR` baseline                                          |
| <0 °C or >40–<45 °C    | severe outdoor discomfort; cap or `UNSUITABLE` candidate |
| >=45 °C                | global override rule                                     |

These are calibration starting points, not universal physiological boundaries.

## Precipitation

Precipitation must be synthesized from temporal shape, not only a daily total.

The activity profile should retain enough information to distinguish:

- brief shower;
- intermittent light rain;
- persistent drizzle;
- sustained moderate rain;
- sustained/heavy rain.

Useful evidence includes:

- total precipitation;
- number of wet hours;
- peak hourly precipitation;
- persistence.

Exact precipitation thresholds are calibrative.

Sustained heavy precipitation must be able to cap or veto a window even where temperature is ideal.

## Snowfall

Snowfall is not automatically negative for outdoor sightseeing.

Light snow with reasonable temperature, visibility and wind may remain usable or pleasant.

Persistent or heavy snowfall should progressively degrade the window, especially when combined with poor visibility or wind.

Global blizzard-like conditions are handled before ordinary activity scoring.

## Wind calibration baseline

Ordinary wind comfort should use representative sustained wind.

The initial calibration baseline is:

| Sustained wind | Starting effect                    |
| -------------- | ---------------------------------- |
| <20 km/h       | little/no penalty                  |
| 20–30 km/h     | minor degradation                  |
| 30–40 km/h     | meaningful degradation             |
| 40–50 km/h     | strong degradation                 |
| >50 km/h       | generally poor outdoor sightseeing |

Maximum gust remains available for caps/hazards and the global extreme-wind rule.

## Visibility

The synthesis should retain:

- representative visibility;
- minimum visibility;
- duration of poor visibility.

Persistent very poor visibility may cap or veto an otherwise comfortable sightseeing period.

Exact visibility thresholds are calibrative.

## Internal scoring baseline

A numeric window score may be used.

The initial HCI-informed weighting baseline is approximately:

- thermal comfort: `35%`;
- precipitation: `30%`;
- wind: `20%`;
- visibility: `15%`.

These are calibration values, not permanent product invariants.
If implementation exposes a bad outcome, reopen calibration, update and re-accept calibration.md, then redo affected downstream phases.

Any calibration change must be recorded before the evaluator oracle is frozen.

## Non-compensable conditions

Pure weighted averaging is insufficient.

The model must support:

- hard vetoes;
- rating caps.

Examples include:

- thunderstorm during the candidate activity period;
- sustained/heavy precipitation;
- extremely poor visibility;
- activity-specific strong wind;
- severe thermal discomfort.

Exact activity-level thresholds are calibrative unless already covered by the global override.

## Daily aggregation

The daily outdoor rating is based on both:

1. quality of the best meaningful sightseeing window; and
2. amount of useful sightseeing time available during the day.

The exact category conversion is calibrative.

The following invariants are fixed:

- one excellent hour cannot produce an excellent day;
- several excellent/good contiguous hours can legitimately characterize the day even if later weather is poor;
- disconnected fragments are less valuable than a meaningful contiguous period;
- inadequate coverage must become `UNKNOWN`, not optimistic scoring.

---

# Surfing

## Activity semantics

Surfing is a **session-finding problem**.

The rating means approximately:

> How favourable are the forecast marine and meteorological conditions for finding a worthwhile recreational surfing session in the resolved coastal area?

The result is a coarse city/area-level marine/weather assessment.

It does not establish:

- that a surf break exists;
- that a particular break works;
- safety for a specific surfer;
- the surfer's skill level;
- break-specific tide suitability;
- break-specific wind direction;
- break-specific swell direction;
- rip/current safety.

An `EXCELLENT` result means excellent broad marine/weather potential, not a break-specific safety declaration.

## Timestamp alignment

Weather and marine observations must be evaluated at the same local timestamp.

The implementation must not synthesize surfing from unrelated daily extrema.

For example, this is invalid:

```text
max wave height from 06:00
max period from 14:00
lowest wind from 20:00
→ synthetic "excellent" condition
```

Surf scoring requires simultaneous conditions.

## Surf access period

The initial surf-access period is:

```text
sunrise - 90 minutes
through
sunset + 60 minutes
```

Solar times are destination-local and come from the application forecast model.

This is intended to include realistic dawn/dusk sessions while excluding excellent middle-of-the-night marine conditions from ordinary recreational scoring.

The exact offsets are calibrative but these are the default v1 values.

## Required scoring inputs

The initial required surf inputs are:

- total wave height;
- swell period;
- combined/total wave period;
- sustained wind speed;
- weather code for activity hazards.

### Wave height

Wave height is not monotonic.

The heuristic must favour a broad recreational middle range and degrade again when waves become excessively large/powerful for an unspecified generic recreational user.

Exact wave-height bands are calibrative.

Large waves must not become `EXCELLENT` merely because they are large.

### Swell period

Swell period is the primary positive period-quality signal.

Longer organised swell can improve the surf score relative to short-period conditions, but no single number of seconds is treated as a universal research-derived category boundary.

Exact period bands are calibrative.

### Combined wave period as chop/mixed-sea signal

Combined wave period is used mainly as a supporting degradation signal.

If combined wave period is materially shorter than swell period, the heuristic may apply a small penalty or rating cap because the sea state may contain a significant short-period component.

The exact ratio/difference is calibrative.

This penalty must remain secondary to the principal wave-height, swell-period and wind signals and must avoid excessive double-counting of wind-driven chop.

### Wind

Relatively light wind should generally favour higher suitability.

Stronger wind should progressively degrade surf quality.

Wind direction is excluded because the city-level model does not know the orientation of the actual break.

## Explicitly excluded marine inputs

The v1 score does not interpret:

- wind direction relative to a break;
- swell direction;
- tide;
- modelled current velocity;
- bathymetry;
- coastline orientation;
- surf-break geometry.

These inputs require local geographic context that the product does not have.

## Hourly scoring

Aligned surf observations may receive an internal hourly suitability score.

A reasonable structure is:

```text
wave-height suitability
        +
swell-period quality
        +
wind suitability
        +
small mixed/choppy-sea adjustment from wave-vs-swell period
        ↓
hourly internal score
        ↓
activity-specific caps / vetoes
        ↓
hourly surfability
```

Exact numeric weights and category thresholds are calibrative.

## Activity-specific hazard logic

Surfing may have stricter vetoes than the global override.

Examples include:

- thunderstorm affecting a surf session;
- excessively large/powerful surf for the generic recreational-user model;
- severe local wind conditions.

Exact thresholds are calibrative.

## Minimum session duration

A meaningful surfing session initially requires approximately:

`2 contiguous hours`

A single unusually good hour should not normally make the day highly rated.

## Discrete opportunities

A surfing opportunity is a maximal contiguous run of sufficiently surfable observations.

Overlapping rolling windows from the same favourable period do not count as separate opportunities.

For example:

```text
05:00–07:00 EXCELLENT
06:00–08:00 EXCELLENT
```

is one morning opportunity, not two.

A brief deterioration does not necessarily need to split an opportunity if the design calibration concludes that the period still represents one realistic session.

An `UNSUITABLE` interval would normally split opportunities.

## Best two opportunities

The daily surf profile must preserve the two strongest genuinely distinct opportunities where they exist.

The daily rating is based primarily on:

1. quality of the best opportunity;
2. quality of the second-best opportunity;
3. duration of those opportunities.

The two opportunity ratings are not simply averaged.

The fixed semantic is:

> The best opportunity establishes how good surfing can become; the second opportunity and duration establish how strongly the whole day deserves that rating.

The exact aggregation matrix is calibrative.

A reasonable scenario baseline is:

```text
EXCELLENT + EXCELLENT
→ clearly EXCELLENT day

EXCELLENT + GOOD
→ likely EXCELLENT

GOOD + GOOD
→ solid GOOD day

one short GOOD opportunity only
→ FAIR or GOOD depending calibration
```

## `POOR`, `UNSUITABLE`, `UNKNOWN`

`POOR` means there is credible evidence of surfable but unattractive conditions.

`UNSUITABLE` means available evidence supports not recommending surfing.

Potential causes include:

- no meaningful marine surf conditions;
- excessively large/powerful surf;
- activity-specific hazard veto;
- global extreme-weather override;
- structural marine non-applicability established by full-horizon null evidence.

`UNKNOWN` means there is not enough trustworthy evidence.

Provider failure or inconclusive partial coverage must remain `UNKNOWN`.

## Full-horizon marine null rule

Structural marine non-applicability must **not** be inferred from one null target day.

It is inferred only from consistent absence across the full successfully validated marine horizon fetched by the service, currently roughly eight days of evidence around the seven target dates.

The v1 rule is:

> If the full successfully validated marine dataset contains no usable values for the required marine observations across the entire fetched horizon, surfing may be treated as structurally `UNSUITABLE` for the target dates.

This is intended to distinguish an inland/non-applicable location from a temporary gap in marine coverage.

Therefore:

```text
full successful marine horizon is effectively all-null
→ structural surfing UNSUITABLE

single null target date
→ not enough to infer non-applicability

partial/inconclusive marine data
→ activity sufficiency rules apply; potentially UNKNOWN

marine request/validation failure
→ UNKNOWN
```

The exact implementation must preserve the existing Spike 001 `NO_DATA` versus `UNAVAILABLE` distinction.

---

# Skiing

## Activity semantics

Skiing is a **sustained daytime activity**.

The rating means approximately:

> How suitable are the forecast snow and weather conditions for undertaking a substantial daytime skiing session at the resolved location?

It is a meteorological suitability estimate.

It does not establish:

- that a ski resort exists;
- that lifts are operating;
- piste snow depth;
- artificial snow availability;
- mountain conditions at a different altitude;
- avalanche safety;
- road/resort access.

An `EXCELLENT` rating means excellent weather/snow potential at the resolved forecast location, not confirmation that skiing is actually available.

## Snow is a prerequisite

Snow is prerequisite evidence, not merely another comfort variable.

Excellent temperature, low wind and good visibility cannot generate a high skiing rating when there is no credible snow evidence.

The scoring sequence begins with:

```text
snow viability
    ↓
skiing-weather quality
```

## Snow-depth interpretation

Open-Meteo snow depth is evidence of natural snow at the modelled location.

It is not equivalent to:

- groomed piste depth;
- artificial snow;
- conditions at a nearby higher-altitude resort;
- snow distribution across a mountain.

Published ski-tourism references using approximately `30 cm` snow depth may inform calibration.

The v1 implementation must **not** use `30 cm` as a universal binary gate.

Instead, broad snow-viability bands are calibrative.

## No elevation rule

The v1 implementation must not impose a generic minimum elevation.

A rule such as:

```text
elevation < 1000m
→ UNSUITABLE
```

is out of scope and would be unreliable across latitude, climate and city-to-mountain elevation differences.

## No snow versus unknown snow

If valid forecast evidence establishes effectively no meaningful snow cover and no relevant fresh snowfall changes that conclusion, skiing may be `UNSUITABLE`.

If snow-state evidence needed to determine viability is absent or inconclusive, skiing is `UNKNOWN`.

Provider failure must not become `UNSUITABLE`.

## Activity period

The ordinary skiing period is approximately:

`08:00–17:00 local time`

This is a conventional ski-day proxy, not a claim about actual lift opening hours.

## Preceding/overnight context

The activity itself is scored during the daytime period.

Preceding conditions may still provide snow context, for example:

- overnight snowfall;
- overnight rain;
- sustained warmth before the ski period.

The v1 model must not attempt a sophisticated snowpack simulation.

Reported snow depth remains the primary snow-state evidence.

## Minimum sustained opportunity

A high skiing rating requires a sustained opportunity.

The initial meaningful duration is approximately:

`4 contiguous usable hours`

A brief one- or two-hour favourable interval cannot make the day `EXCELLENT`.

## Continuity

One sustained block is preferable to the same number of disconnected good hours.

The synthesis should retain at least:

- longest usable contiguous run;
- best sustained period;
- proportion of the ordinary ski day that is usable.

## Primary dimensions

The initial skiing model principally uses:

1. snow availability / snow depth;
2. snowfall + visibility;
3. wind;
4. temperature;
5. cloud cover only as a weak aesthetic modifier.

### Temperature

Air temperature is used primarily for:

- snow-state/melt context;
- rain-vs-snow context;
- preference around freezing.

Apparent temperature may provide a secondary human-comfort signal.

The calibration should favour conditions around freezing.

Published preferences around approximately `-5 °C to +5 °C` may inform calibration but are not hard universal boundaries.

Very warm conditions should interact with snow viability: warmth with a substantial snow base is different from the same warmth with marginal snow.

### Snowfall

Snowfall is not automatically bad.

Brief/light snowfall may be neutral or mildly favourable.

Persistent/heavy snowfall should increasingly degrade the score, particularly when visibility deteriorates.

### Rain and freezing rain

Rain strongly degrades skiing through both comfort and snow-quality effects.

Freezing rain is more severe and may trigger an activity-specific veto or the global override.

### Visibility

Visibility is an explicit skiing input.

The synthesis should retain representative visibility, minimum visibility and duration of poor visibility.

Persistent poor visibility should strongly cap skiing suitability.

### Wind

Representative sustained wind is a major ordinary comfort input.

Duration of stronger wind matters.

Maximum gust is used for caps/hazards and the global override.

Published preferences for very light wind and references around `10 m/s / 36 km/h` as an upper bound for an "optimal" ski day may inform calibration but must not become a brittle binary rule.

### Cloud cover

Cloud cover may be retained as a weak aesthetic modifier.

It must not turn an otherwise good ski day into `POOR` or `UNSUITABLE`.

## Internal weighting baseline

The initial calibration baseline is approximately:

| Dimension                      | Starting importance |
| ------------------------------ | ------------------: |
| Snow availability / snow depth |              35–40% |
| Snowfall + visibility          |              20–25% |
| Wind                           |                ~20% |
| Temperature                    |              15–20% |
| Cloud/aesthetics               |                0–5% |

These are calibration values, not fixed product invariants.

Snow remains a prerequisite/dominant input regardless of later tuning.

## Non-compensable conditions

The model must support caps and vetoes.

Examples include:

```text
credible no-snow evidence
→ UNSUITABLE

heavy freezing rain
→ UNSUITABLE / global override

persistent severe visibility loss
→ strong cap or veto

persistent strong wind
→ cap

very warm conditions + marginal snow
→ strong cap / potentially UNSUITABLE
```

Excellent temperature cannot compensate for absent snow.

## Daily aggregation

The final skiing rating considers:

1. snow viability;
2. quality of the best sustained skiing period;
3. longest usable contiguous duration;
4. proportion of the ordinary ski day that remains usable.

The daily rating must not be:

- the best single hour; or
- a simple mean of every hour.

Calibration scenarios should include:

```text
substantial snow, around freezing, light wind, good visibility
→ EXCELLENT candidate

substantial snow, -10 °C, light wind, clear
→ likely GOOD, not automatically POOR

substantial snow, +7 °C, light wind
→ potentially FAIR/GOOD

marginal snow, +7 °C
→ POOR or UNSUITABLE

heavy snowfall + poor visibility
→ POOR/UNSUITABLE depending severity

excellent snow + persistent 35–45 km/h wind
→ materially downgraded

2 excellent hours, rest poor
→ cannot be EXCELLENT

3 good hours morning + 3 poor + 3 good afternoon
→ worse than six continuous good hours

effectively zero snow with otherwise ideal weather
→ UNSUITABLE

pleasant cold weather but snow state unavailable
→ UNKNOWN
```

---

# Indoor sightseeing

## Activity semantics

Indoor sightseeing intentionally uses a simple weather-relative model.

The rating means:

> How suitable is the day for choosing indoor sightseeing, based only on weather and the opportunity cost of giving up better outdoor activities?

It does not assess:

- whether attractions exist;
- opening hours;
- ticket availability;
- transport availability;
- venue quality.

## Default rating

Indoor sightseeing is:

`GOOD`

by default when:

- the ordinary weather source contains enough trustworthy information for the day; and
- the global extreme-weather override does not apply.

Ordinary rain, cold, heat below the global threshold, cloud, poor visibility, snow and moderate wind do not directly reduce indoor sightseeing below `GOOD`.

## Global override

If the global extreme-weather override applies:

`INDOOR_SIGHTSEEING = UNSUITABLE`

## Opportunity-cost boost

Indoor sightseeing becomes:

`EXCELLENT`

when weather has removed all meaningful `GOOD` or `EXCELLENT` outdoor opportunities.

The boost means that indoor sightseeing is the strongest weather-based choice, not that bad weather makes indoor attractions intrinsically better.

Conceptually:

```text
if globalExtremeWeather:
    indoor = UNSUITABLE

else if no meaningful GOOD/EXCELLENT
        weather-dependent outdoor opportunity remains:
    indoor = EXCELLENT

else:
    indoor = GOOD
```

## Structural non-applicability must not boost indoor

Structural non-applicability is different from weather-driven opportunity loss.

For example:

```text
surfing structurally UNSUITABLE inland
skiing structurally UNSUITABLE due no snow
outdoor sightseeing GOOD
→ indoor GOOD
```

An inland location must not receive `EXCELLENT` indoor sightseeing every day because surfing is impossible there.

Likewise, absence of ski snow is not automatically evidence that indoor sightseeing is unusually attractive because of weather.

## Internal reason semantics

The implementation must preserve enough internal reasoning to distinguish at least:

- weather-driven rating;
- structural non-applicability;
- insufficient data / `UNKNOWN`;
- global extreme-weather veto.

A small internal representation is sufficient, for example:

```ts
type ActivityAssessment = {
  rating: Rating;
  reasonCategory: ReasonCategory;
};
```

The exact type is implementation-owned and does not need to be exposed through GraphQL.

## Unknown outdoor activities and the indoor boost

An `UNKNOWN` outdoor activity must **not** be treated as a lost outdoor opportunity for purposes of the `EXCELLENT` indoor boost.

If ordinary weather evidence is sufficient to support indoor sightseeing itself, but surfing is `UNKNOWN` because marine data failed, indoor may still remain `GOOD`; the missing surf evidence does not justify claiming that weather removed the opportunity.

If the ordinary weather source itself is too incomplete to assess the day reliably, indoor may be `UNKNOWN`.

## Rating set

Indoor sightseeing will normally use only:

- `EXCELLENT`;
- `GOOD`;
- `UNSUITABLE`;
- `UNKNOWN`.

`FAIR` and `POOR` have no clear weather-only meaning in the v1 indoor model.

## Scoring order

The dependency order is:

1. global extreme-weather override;
2. skiing;
3. surfing;
4. outdoor sightseeing;
5. indoor sightseeing.

Indoor sightseeing consumes synthesized activity results rather than raw weather.

---

# Calibration rules

The product semantics above are fixed for this spike.

Several numeric mappings remain calibration values rather than claims of universal scientific thresholds.

These include:

- exact outdoor comfort category boundaries below the global extreme thresholds;
- precipitation intensity/duration bands;
- ordinary wind/visibility categories;
- wave-height ranges;
- swell-period ranges;
- combined-vs-swell-period chop penalty;
- surf wind bands;
- large-wave surf cap/veto threshold;
- ski snow-depth bands;
- ski ordinary temperature bands;
- ski activity-specific wind and visibility caps;
- exact internal numeric weights;
- exact daily aggregation matrices;
- exact per-activity minimum-coverage percentages.

## Calibration-authoring phase

Before Design Map preparation, Spike 002 requires a bounded
calibration-authoring pass.

That pass is explicitly authorised to convert the calibration baselines in this
brief and `../../decisions.md` into exact v1 rules.

It may choose:

- per-activity evidence-sufficiency thresholds;
- outdoor thermal, precipitation, wind and visibility bands;
- outdoor weighting and cap/veto rules;
- surf wave-height, swell-period, combined-period and wind bands;
- surf opportunity quality and daily aggregation rules;
- ski snow-viability, temperature, wind and visibility bands;
- ski sustained-opportunity and daily aggregation rules;
- exact categorical boundary behaviour.

Calibration must be performed against explicit representative scenarios and the
product semantics already fixed by this brief and `../../decisions.md`.

The calibration pass may refine the supplied starting values but must not alter
the higher-level activity semantics, introduce new product capabilities, or
contradict the global override rules.

Its output is `calibration.md`.

Once human-reviewed and accepted, `calibration.md` is incorporated by reference
into the Spike 002 contract and becomes frozen input to Design Map preparation
and evaluator preparation.

After human acceptance, root `../../brief.md` must be updated to reference the accepted `spikes/002-activity-scoring/calibration.md` as the governing v1 activity-methodology
calibration. This update is required before Design Map preparation and implementation proceed.

The accepted calibration artifact supplements this Spike 002 brief: it fixes the exact v1 thresholds, sufficiency rules, weights, caps, vetoes, aggregation rules, and scenario
outcomes without changing the higher-level semantics already established here.

Any later change to those values is a contract change.

### Small observation-model amendment

Add `rain` to the required v1 weather observations. Skiing needs to distinguish
rain from snowfall rather than inferring that distinction only from total
precipitation.

The v1 weather observations therefore include:

- air temperature;
- apparent temperature;
- precipitation;
- rain;
- snowfall;
- snow depth;
- sustained wind speed;
- wind gust;
- visibility;
- weather code;
- cloud cover;
- daily sunrise;
- daily sunset.

## Calibration procedure

Before evaluator preparation, `calibration.md` must make the exact per-activity sufficiency checks,
thresholds, caps, vetoes and category mappings executable before Design Map preparation. The Design Map consumes those rules; it does not author them.

Calibration should be tested against explicit representative scenarios rather than selected solely because the numbers look neat.

A calibration change is acceptable before the evaluator oracle is frozen if:

- it preserves the product semantics in this brief and `decisions.md`;
- the scenario motivating the change is recorded;
- the final value is explicit and testable.

Once evaluator preparation is complete, changing scoring semantics or calibration values is a contract change and must be treated as such by the workflow.

---

# Required integration with Spike 001

Spike 002 builds on the existing Spike 001 provider and service boundaries rather than replacing them.

Implementation must:

- retain canonical provider-backed location identity;
- retain destination-local seven-date selection;
- retain independent weather/marine acquisition;
- retain `AVAILABLE` / `PARTIAL` / `NO_DATA` / `UNAVAILABLE` source metadata;
- retain provider runtime validation;
- retain application-owned observation selection with provider-field translation;
- retain same-location in-process coalescing;
- retain the existing GraphQL response's broad date/activity alignment.

The application observation set must be expanded from Spike 001's representative fields to the final v1 scoring fields defined by this spike.

The activity arrays should no longer be unconditional `UNKNOWN` placeholders.

They should contain the actual Spike 002 rating result for each target date.

---

# Persistence boundary

Durable persistence remains out of scope for Spike 002.

Spike 002 must establish the application forecast model that persistence will need, but it must not prematurely choose a durable schema.

The dependency remains:

```text
activity semantics
    ↓
required observations
    ↓
application forecast model
    ↓
Spike 002 scoring
    ↓
Spike 003 persisted representation and request lifecycle
```

Spike 003 will implement:

- durable snapshot storage;
- persisted payload/schema;
- request-time snapshot lookup;
- `<3h` fresh reuse;
- refresh + persist;
- `<=24h` stale fallback after refresh failure;
- restart-surviving reuse;
- final persistence-integrated request path.

Spike 002 should not introduce a database or ORM merely to anticipate Spike 003.

---

# Out of scope

This spike does not implement:

- durable forecast persistence;
- request-time persisted reuse;
- stale persisted fallback;
- snapshot cleanup;
- surf-break discovery;
- coastline/bathymetry modelling;
- break-specific tide or directional interpretation;
- surfer skill profiles;
- ski-resort discovery;
- lift/piste availability;
- artificial snow;
- avalanche assessment;
- attraction discovery;
- official weather warnings;
- a generic weather-provider framework;
- partial-current-day activity scoring.

---

# Acceptance criteria

Spike 002 is complete when:

- the final v1 weather and marine observation set is application-owned and mapped through the Open-Meteo adapter;
- sunrise/sunset are available to the application without a new external provider;
- weather and marine observations needed by surfing can be aligned by destination-local timestamp;
- activity scoring uses activity-specific synthesis rather than a universal daily summary;
- the global extreme-weather override is implemented over the agreed local `06:00–22:00` period;
- source coverage remains distinct from activity-data sufficiency;
- missing or failed data produces `UNKNOWN` where a conclusion cannot be justified;
- outdoor sightseeing evaluates meaningful approximately three-hour daytime windows;
- outdoor scoring preserves temporal precipitation shape and does not allow pure arithmetic compensation for obviously bad conditions;
- surfing evaluates approximately two-hour sessions inside its sunrise-relative access period;
- surfing uses wave height, swell period, combined wave period and aligned wind as the principal v1 signals;
- overlapping windows from one favourable surf period cannot become two separate "best opportunities";
- surfing's daily result uses the best two genuinely discrete opportunities where available;
- a full successfully validated all-null marine horizon can establish structural surfing `UNSUITABLE`, while a single null target date cannot;
- skiing treats snow viability as a prerequisite;
- skiing evaluates a sustained daytime opportunity of approximately four contiguous hours rather than isolated best hours;
- skiing does not use a generic elevation gate or claim resort availability;
- indoor sightseeing is `GOOD` by default, subject to weather evidence and the global override;
- indoor sightseeing becomes `EXCELLENT` only when weather, rather than structural non-applicability or missing data, removes meaningful `GOOD`/`EXCELLENT` outdoor alternatives;
- the implementation preserves enough internal reason state to distinguish weather-driven outcomes, structural non-applicability and insufficient data;
- the GraphQL activity arrays contain real date-aligned categorical ratings rather than unconditional placeholders;
- representative calibration and boundary scenarios are covered by deterministic tests;
- `npm run typecheck` passes;
- the deterministic test suite passes;
- live Open-Meteo integration tests remain opt-in and are not required for deterministic unit/evaluator success;
- no durable persistence technology or schema is introduced in this spike.

---

# Representative evaluator scenarios

The evaluator should be able to falsify the implementation with controlled forecast inputs including at least:

## Cross-activity

- global extreme heat for two consecutive relevant hours → all activities `UNSUITABLE`;
- same extreme heat only around 03:00 → no automatic global day veto;
- provider fields missing such that an activity cannot be evaluated → that activity `UNKNOWN`, not optimistic or automatically `UNSUITABLE`;
- 23- or 25-hour destination-local day → no structural rejection based on record count alone.

## Outdoor sightseeing

- several dry comfortable contiguous hours followed by poor weather → useful day remains appropriately high;
- one excellent hour only → cannot produce `EXCELLENT`;
- sustained rain with ideal temperature → rain cap/veto prevents compensation;
- light snow, light wind and good visibility → not automatically poor;
- persistent poor visibility → materially downgraded.

## Surfing

- moderate waves + long swell period + light wind → strong candidate;
- moderate waves + short swell period → lower quality;
- long swell period but materially shorter combined wave period → small chop/mixed-sea degradation;
- strong wind despite good wave/period conditions → downgraded;
- very large surf → cannot become `EXCELLENT` merely through size;
- two overlapping excellent rolling windows from one morning period → one opportunity;
- two genuinely separate strong morning/evening opportunities → both retained;
- excellent marine conditions only in the middle of the night → do not make the day `EXCELLENT`;
- one target date all-null but rest of horizon has marine data → do not infer structural non-applicability;
- full successfully validated marine horizon all-null → structural surfing `UNSUITABLE`;
- failed marine request → surfing `UNKNOWN`.

## Skiing

- substantial snow + around-freezing temperature + light wind + good visibility → `EXCELLENT` candidate;
- effectively no snow + otherwise perfect skiing weather → `UNSUITABLE`;
- snow state unavailable → `UNKNOWN`;
- two excellent hours only → cannot become `EXCELLENT`;
- one sustained four-plus-hour strong period → can support a high rating;
- split good periods separated by poor conditions → worse than one equivalent continuous period;
- rain with marginal snow → strongly downgraded;
- persistent poor visibility or strong wind → cap despite good snow.

## Indoor sightseeing

- no global override + strong outdoor sightseeing opportunity → indoor `GOOD`;
- weather makes all meaningful outdoor alternatives weak → indoor `EXCELLENT`;
- surfing structurally non-applicable inland but outdoor sightseeing good → indoor remains `GOOD`;
- surfing `UNKNOWN` because marine provider failed → missing surf evidence does not by itself boost indoor to `EXCELLENT`;
- global override → indoor `UNSUITABLE`.

---

# Evidence boundary

The heuristic is informed by the research recorded in `../../decisions.md`.

The implementation may cite that research to justify:

- which meteorological variables matter;
- relative emphasis;
- the use of session/window-based activity semantics;
- important domain limitations.

It must not claim that the exact v1 category thresholds or calibration weights are published scientific boundaries unless the cited research actually establishes them.

The API returns a product heuristic, not an official warning, safety assessment, surf-break forecast or ski-resort availability statement.
