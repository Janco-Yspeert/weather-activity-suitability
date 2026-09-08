# Spike 002 — v1 Calibration

Status: ACCEPTED

This revision closes the two aggregation gaps identified by brief-readiness:
outdoor daily fallback ratings for thin usable-hour coverage, and skiing days
with scorable `POOR` hours but no `FAIR`-or-better usable hours.

This file converts the calibration baselines in `../../decisions.md` and the
Spike 002 brief into exact, executable v1 rules.

It does not change the higher-level activity semantics. It fixes the thresholds,
coverage rules, caps, vetoes and daily aggregation needed by the Design Map,
evaluator and implementation.

## 1. Shared internal utility scale

Weighted activity heuristics may use an internal `0–100` utility score.

This value is an implementation and calibration aid only. It is **not**:

- a probability;
- a confidence percentage;
- a scientific weather index;
- a public API value.

GraphQL continues to expose only the categorical activity rating.

Component bands use deliberately coarse whole-number utility points:

| Component band | Internal utility |
| -------------- | ---------------: |
| `EXCELLENT`    |              100 |
| `GOOD`         |               75 |
| `FAIR`         |               50 |
| `POOR`         |               25 |
| `SEVERE`       |                0 |

Where weighted calculations produce a fractional value, round the final
weighted utility to the nearest whole number before category mapping.

Map ordinary weighted suitability to the public quality categories using:

| Internal utility | Category    |
| ---------------: | ----------- |
|         `80–100` | `EXCELLENT` |
|          `60–79` | `GOOD`      |
|          `40–59` | `FAIR`      |
|           `0–39` | `POOR`      |

`UNSUITABLE` is deliberately **outside** the numeric utility scale.

It is produced only by an explicit global/activity veto, failed prerequisite,
or other affirmative rule documented below. A sufficiently low weighted score
does not accidentally become `UNSUITABLE`.

`UNKNOWN` is also outside the numeric scale. It is produced only when the
required evidence is insufficient.

Caps and vetoes are applied after ordinary weighted scoring.

## 2. Shared evidence rules

### 2.1 Source coverage remains unchanged

Spike 001 source metadata keeps its existing weak definition of `coveredDates`.

This calibration does not redefine `AVAILABLE`, `PARTIAL`, `NO_DATA` or
`UNAVAILABLE`.

### 2.2 Activity sufficiency is separate

Each activity has its own sufficiency rule below.

A positive rating requires enough complete, timestamp-aligned observations to
establish the opportunity being rated.

A negative conclusion requires enough coverage of the relevant activity period
to make the absence of a useful opportunity credible.

A day is never rejected merely because it contains 23 or 25 local hours.

### 2.3 Missing values

Missing values are not zero and are not favourable.

An hourly activity observation is `scorable` only when all fields marked
required for that activity/hour are present and finite.

Optional modifiers may be omitted without making the hour unscorable.

## 3. Global extreme-weather calibration

The global override is evaluated from `06:00` through `22:00` destination-local
time.

The following rules are fixed:

- wind gust `>= 93 km/h` at any relevant hour;
- at least 3 consecutive relevant hours with:
  - snowfall `> 0`;
  - visibility `<= 400 m`;
  - wind gust `>= 56 km/h`;
- WMO weather code `67`;
- apparent temperature `>= 45 °C` for at least 2 consecutive relevant hours;
- apparent temperature `<= -30 °C` for at least 2 consecutive relevant hours;
- WMO weather code `99`.

If one of these conditions is positively established, all activities are
`UNSUITABLE`.

Missing global-hazard fields do not themselves trigger the override. They may,
however, contribute to an activity becoming `UNKNOWN` where that activity
cannot otherwise be evaluated reliably.

---

# 4. Outdoor sightseeing calibration

## 4.1 Activity period and required evidence

Activity period:

`08:00–18:00 local time`

A candidate sightseeing window contains 3 consecutive hourly observations.

A sightseeing hour is scorable when all of the following are present:

- apparent temperature;
- precipitation;
- sustained wind speed;
- visibility;
- weather code.

Snowfall and wind gust are supporting/cap inputs and do not make an otherwise
complete ordinary hour unscorable if absent.

A candidate 3-hour window is scorable only if all 3 constituent hours are
scorable.

A daily outdoor rating requires at least one scorable 3-hour window.

If there is no scorable 3-hour window, outdoor sightseeing is `UNKNOWN`.

## 4.2 Thermal component

Use median apparent temperature across the 3-hour window.

| Median apparent temperature | Utility |
| --------------------------- | ------: |
| `18–27 °C`                  |     100 |
| `12–<18 °C` or `>27–32 °C`  |      75 |
| `5–<12 °C` or `>32–36 °C`   |      50 |
| `0–<5 °C` or `>36–40 °C`    |      25 |
| `<0 °C` or `>40–<45 °C`     |       0 |

A thermal component utility of `0` caps the window at `POOR`; it does not by
itself create the global veto.

## 4.3 Precipitation component

For the 3-hour window define:

- `totalPrecipitation`;
- `wetHours` = number of hours with precipitation `> 0.1 mm`;
- `maxHourlyPrecipitation`.

Utility:

| Condition                                                  | Utility |
| ---------------------------------------------------------- | ------: |
| total `<= 0.2 mm`                                          |     100 |
| total `<= 1.5 mm`, wetHours `<= 1`, max hourly `<= 1.5 mm` |      75 |
| total `<= 3.0 mm`, max hourly `<= 2.0 mm`                  |      50 |
| total `<= 6.0 mm`, max hourly `<= 4.0 mm`                  |      25 |
| otherwise                                                  |       0 |

A precipitation component utility of `0` caps the window at `POOR`.

This deliberately distinguishes a brief shower from persistent light rain:
three wet hours cannot receive the `GOOD` precipitation score even if their
combined total is small.

## 4.4 Wind component

Use median sustained wind speed.

| Median sustained wind | Utility |
| --------------------- | ------: |
| `<20 km/h`            |     100 |
| `20–<30 km/h`         |      75 |
| `30–<40 km/h`         |      50 |
| `40–<50 km/h`         |      25 |
| `>=50 km/h`           |       0 |

A wind component utility of `0` caps the window at `POOR`.

If a supporting wind-gust value is present:

- gust `>= 70 km/h` caps the window at `FAIR`;
- gust `>= 80 km/h` caps the window at `POOR`;
- gust `>= 93 km/h` is already handled by the global override.

## 4.5 Visibility component

Use median visibility.

| Median visibility | Utility |
| ----------------- | ------: |
| `>=10 km`         |     100 |
| `5–<10 km`        |      75 |
| `2–<5 km`         |      50 |
| `0.5–<2 km`       |      25 |
| `<0.5 km`         |       0 |

Additional caps:

- any hour `<200 m` makes the window `UNSUITABLE`;
- at least 2 hours `<500 m` caps the window at `POOR`.

## 4.6 Thunderstorm veto

Any WMO weather code `95`, `96` or `99` within the candidate window makes that
window `UNSUITABLE`.

Code `99` will normally already have triggered the global override.

## 4.7 Window utility

Weighted utility:

- thermal: `35%`;
- precipitation: `30%`;
- wind: `20%`;
- visibility: `15%`.

Round the weighted utility to the nearest whole point, map it using the shared
category boundaries, then apply all vetoes/caps.

## 4.8 Usable hour

For daily aggregation, an individual sightseeing hour is `usable` when:

- all ordinary required fields are present;
- it is not thunderstorm-vetoed;
- its per-hour weighted utility is at least `40` (`FAIR`).

The per-hour weighted utility uses the same 35/30/20/15 weights, with the
hour's own values rather than 3-hour medians/totals. Round the weighted result
to the nearest whole utility point before category mapping.

## 4.9 Daily outdoor rating

Let:

- `bestWindow` = highest-rated scorable 3-hour window;
- `usableHours` = count of distinct usable hours in the 08:00–18:00 period.

Daily mapping:

| Best window  | Usable hours | Daily rating |
| ------------ | -----------: | ------------ |
| `EXCELLENT`  |        `>=6` | `EXCELLENT`  |
| `EXCELLENT`  |        `3–5` | `GOOD`       |
| `EXCELLENT`  |        `0–2` | `FAIR`       |
| `GOOD`       |        `>=5` | `GOOD`       |
| `GOOD`       |        `3–4` | `FAIR`       |
| `GOOD`       |        `0–2` | `POOR`       |
| `FAIR`       |        `>=3` | `FAIR`       |
| `FAIR`       |        `0–2` | `POOR`       |
| `POOR`       |          any | `POOR`       |
| `UNSUITABLE` |          any | `UNSUITABLE` |

This fallback is intentionally monotonic: a high-quality synthesized window can
still keep the day above `POOR` when the independently counted usable-hour
coverage is thin, but insufficient usable duration prevents a high daily
rating.

If all scorable windows are `UNSUITABLE`, the daily rating is `UNSUITABLE`.

---

# 5. Surfing calibration

## 5.1 Required evidence

For a surf hour to be scorable, all of the following must be present at the
same destination-local timestamp:

- total wave height;
- swell period;
- combined/total wave period;
- sustained wind speed;
- weather code.

Sunrise and sunset for the target date must also be present.

Surf-access period:

`sunrise - 90 minutes` through `sunset + 60 minutes`.

Expected hourly surf slots are the hourly timestamps falling within that
interval.

A target day requires at least `70%` of expected surf slots to be scorable to
produce an ordinary daily surf rating.

If fewer than `70%` are scorable, surfing is `UNKNOWN`, except where the
full-horizon structural-null rule positively establishes non-applicability.

## 5.2 Wave-height component

Total wave height uses a deliberately non-monotonic recreational-user curve.

| Total wave height | Utility |
| ----------------- | ------: |
| `<0.30 m`         |       0 |
| `0.30–<0.60 m`    |      25 |
| `0.60–<0.90 m`    |      50 |
| `0.90–1.80 m`     |     100 |
| `>1.80–2.50 m`    |      75 |
| `>2.50–3.00 m`    |      50 |
| `>3.00–<4.00 m`   |      25 |
| `>=4.00 m`        |       0 |

Wave height `>=4.00 m` is an activity-specific `UNSUITABLE` veto for the generic
recreational-user model.

## 5.3 Swell-period component

| Swell period | Utility |
| ------------ | ------: |
| `<5 s`       |       0 |
| `5–<7 s`     |      25 |
| `7–<9 s`     |      50 |
| `9–<12 s`    |      75 |
| `>=12 s`     |     100 |

This is a quality calibration, not a universal scientific boundary.

## 5.4 Wind component

| Sustained wind | Utility |
| -------------- | ------: |
| `<10 km/h`     |     100 |
| `10–<20 km/h`  |      75 |
| `20–<30 km/h`  |      50 |
| `30–<40 km/h`  |      25 |
| `>=40 km/h`    |       0 |

Wind `>=50 km/h` makes the surf hour `UNSUITABLE`.

## 5.5 Mixed/choppy-sea adjustment

Define:

`periodRatio = combinedWavePeriod / swellPeriod`

Apply after the weighted utility:

| Ratio        |           Adjustment |
| ------------ | -------------------: |
| `>=0.85`     |                  `0` |
| `0.70–<0.85` |  `-5` utility points |
| `<0.70`      | `-10` utility points |

The adjustment may lower the category but cannot by itself make an otherwise
positive hour `UNSUITABLE`.

## 5.6 Hourly surf utility

Base weighted utility:

- wave height: `45%`;
- swell period: `30%`;
- wind: `25%`.

Apply the mixed/choppy-sea utility penalty, round to the nearest whole utility
point, and map using the shared category boundaries.

Then apply activity-specific vetoes/caps.

## 5.7 Surf-specific vetoes and caps

- WMO weather code `95`, `96` or `99` → `UNSUITABLE` surf hour.
- total wave height `>=4.0 m` → `UNSUITABLE`.
- total wave height `>=3.5 m` **and** swell period `>=12 s` → `UNSUITABLE`.
- total wave height `>=3.0 m` **and** swell period `>=12 s` → maximum `POOR`.
- wind `>=50 km/h` → `UNSUITABLE`.

These are generic-user product limits, not safety guarantees for a known surfer.

## 5.8 Surfable hour and opportunity

A `surfable` hour is a scorable hour rated at least `FAIR`.

A surf opportunity is a maximal contiguous run of surfable hours.

A valid opportunity requires at least `2 contiguous surfable hours`.

An `UNSUITABLE`, `POOR`, missing or unscorable hour splits opportunities.

## 5.9 Opportunity rating

Within each opportunity, inspect all contiguous 2-hour sessions.

For each 2-hour session, average the two internal hourly utility scores after
adjustments/caps, round to the nearest whole utility point, and map to a
category.

The opportunity rating is the best 2-hour session rating within the contiguous
opportunity.

Opportunity duration is the number of contiguous surfable hours in the run.

## 5.10 Best two discrete opportunities

Sort opportunities by:

1. opportunity rating;
2. best-session internal score;
3. opportunity duration;
4. earlier start time as deterministic tie-breaker.

Retain the best two.

Because opportunities are maximal contiguous runs, overlapping slices of one
favourable period cannot become two separate opportunities.

## 5.11 Daily surf aggregation

If at least two opportunities exist:

| Best        | Second      | Daily       |
| ----------- | ----------- | ----------- |
| `EXCELLENT` | `EXCELLENT` | `EXCELLENT` |
| `EXCELLENT` | `GOOD`      | `EXCELLENT` |
| `EXCELLENT` | `FAIR`      | `GOOD`      |
| `GOOD`      | `GOOD`      | `GOOD`      |
| `GOOD`      | `FAIR`      | `GOOD`      |
| `FAIR`      | `FAIR`      | `FAIR`      |

If exactly one opportunity exists:

| Opportunity |           Duration | Daily       |
| ----------- | -----------------: | ----------- |
| `EXCELLENT` |            `>=4 h` | `EXCELLENT` |
| `EXCELLENT` |            `2–3 h` | `GOOD`      |
| `GOOD`      |            `>=3 h` | `GOOD`      |
| `GOOD`      |              `2 h` | `FAIR`      |
| `FAIR`      | any valid duration | `FAIR`      |

If no valid opportunity exists but the day has at least `70%` scorable surf
coverage:

- if every scorable surf hour is `UNSUITABLE`, daily surfing is `UNSUITABLE`;
- otherwise daily surfing is `POOR`.

## 5.12 Full-horizon structural marine null rule

Structural marine non-applicability is inferred only from the full successfully
validated marine horizon, not from a single target day.

The full horizon is structurally null when **every value** for each required
marine scoring series is null across the fetched marine dataset:

- wave height;
- swell period;
- combined wave period.

If that condition is true, surfing is structurally `UNSUITABLE` for all target
dates.

A single null day, a partial run of nulls, or mixed null/non-null horizon does
not establish structural non-applicability.

Provider request/validation failure remains `UNKNOWN`.

---

# 6. Skiing calibration

## 6.1 Required evidence

For a skiing hour to be scorable, all of the following must be present:

- air temperature;
- snowfall;
- snow depth;
- sustained wind speed;
- visibility;
- weather code;
- rain.

Cloud cover and apparent temperature are optional modifiers.

Ski activity period:

`08:00–17:00 local time`.

For an ordinary daily skiing rating:

- at least `70%` of expected ski-period hours must be scorable;
- snow-depth observations must be present for at least `70%` of expected
  ski-period hours.

If those conditions are not met, skiing is `UNKNOWN`, unless credible no-snow
evidence is already sufficient to establish `UNSUITABLE`.

## 6.2 Snow viability

Use median snow depth across the scorable ski-period observations.

| Median snow depth | Snow utility | Daily cap    |
| ----------------- | -----------: | ------------ |
| `<0.01 m`         |            0 | `UNSUITABLE` |
| `0.01–<0.05 m`    |           25 | `POOR`       |
| `0.05–<0.15 m`    |           50 | `FAIR`       |
| `0.15–<0.30 m`    |           75 | `GOOD`       |
| `>=0.30 m`        |          100 | none         |

Snow depth `<0.01 m` is credible no-snow evidence and makes skiing
`UNSUITABLE` when the snow-depth sufficiency rule is met.

No generic elevation gate is used.

## 6.3 Temperature component

Use hourly air temperature.

| Air temperature              | Utility |
| ---------------------------- | ------: |
| `-5–3 °C`                    |     100 |
| `-10–<-5 °C` or `>3–7 °C`    |      75 |
| `-15–<-10 °C` or `>7–10 °C`  |      50 |
| `-20–<-15 °C` or `>10–15 °C` |      25 |
| `<-20 °C` or `>15 °C`        |       0 |

Temperature utility `0` caps the hour at `POOR` unless the global extreme-cold
rule already applies.

## 6.4 Wind component

| Sustained wind | Utility |
| -------------- | ------: |
| `<12 km/h`     |     100 |
| `12–<20 km/h`  |      75 |
| `20–<30 km/h`  |      50 |
| `30–<40 km/h`  |      25 |
| `>=40 km/h`    |       0 |

Wind `>=50 km/h` makes that ski hour `UNSUITABLE`.

## 6.5 Visibility component

| Visibility | Utility |
| ---------- | ------: |
| `>=10 km`  |     100 |
| `5–<10 km` |      75 |
| `2–<5 km`  |      50 |
| `1–<2 km`  |      25 |
| `<1 km`    |       0 |

Visibility `<500 m` makes that ski hour `UNSUITABLE`.

## 6.6 Snowfall-intensity component

Open-Meteo snowfall is calibrated as centimetres per hour.

| Snowfall        | Utility |
| --------------- | ------: |
| `0–0.5 cm/h`    |     100 |
| `>0.5–1.5 cm/h` |      75 |
| `>1.5–3.0 cm/h` |      50 |
| `>3.0–5.0 cm/h` |      25 |
| `>5.0 cm/h`     |       0 |

The skiing weather component for snowfall/visibility is:

`min(snowfallUtility, visibilityUtility)`

This prevents pleasant snowfall preferences from compensating for poor
visibility.

## 6.7 Rain caps

Hourly rain produces the following cap:

| Rain            | Hourly effect  |
| --------------- | -------------- |
| `0 mm/h`        | no rain cap    |
| `>0–0.5 mm/h`   | maximum `FAIR` |
| `>0.5–2.0 mm/h` | maximum `POOR` |
| `>2.0 mm/h`     | `UNSUITABLE`   |

WMO code `66` (light freezing rain) caps the hour at `POOR`.

WMO code `67` is already a global override.

## 6.8 Cloud modifier

Cloud cover is optional and weak.

If present:

| Cloud cover | Utility |
| ----------- | ------: |
| `<25%`      |     100 |
| `25–50%`    |      75 |
| `>50–75%`   |      50 |
| `>75%`      |      25 |

Cloud cover never produces `UNSUITABLE` and cannot lower the final daily rating
by more than one category.

If cloud cover is absent, omit its weight and renormalize the remaining
ordinary hourly weights.

## 6.9 Hourly ski utility

Base weights:

- snow viability: `35%`;
- snowfall + visibility: `25%`;
- wind: `20%`;
- temperature: `15%`;
- cloud: `5%` when available.

Round the weighted utility to the nearest whole point, then apply rain caps and
other vetoes.

## 6.10 Warm + marginal-snow interaction

After the ordinary score:

- median ski-period temperature `>7 °C` with median snow depth `<0.15 m`
  caps the daily rating at `POOR`;
- median ski-period temperature `>10 °C` with median snow depth `<0.10 m`
  makes skiing `UNSUITABLE`.

This is a product calibration for melt/marginal-snow interaction, not a snowpack
simulation.

## 6.11 Usable ski hour

A ski hour is `usable` when:

- it is scorable;
- it is not vetoed;
- its final hourly rating is at least `FAIR`.

## 6.12 Sustained opportunity

A meaningful sustained ski opportunity requires at least:

`4 contiguous usable hours`.

For every contiguous 4-hour block of usable hours, average the four internal
hourly utility scores, round to the nearest whole utility point, and map to a
category.

The `bestSustainedBlock` is the highest-rated 4-hour block.

## 6.13 Daily ski aggregation

Let:

- `longestUsableRun` = longest contiguous run of usable ski hours;
- `usableFraction` = usable ski hours / expected ski-period hours.

Apply snow caps first.

Then:

| Condition                                                 | Daily baseline |
| --------------------------------------------------------- | -------------- |
| best 4h block `EXCELLENT` and usableFraction `>=0.75`     | `EXCELLENT`    |
| best 4h block `EXCELLENT` and usableFraction `<0.75`      | `GOOD`         |
| best 4h block `GOOD` and usableFraction `>=0.60`          | `GOOD`         |
| best 4h block `GOOD` and usableFraction `<0.60`           | `FAIR`         |
| best 4h block `FAIR`                                      | `FAIR`         |
| no 4h usable block, but at least one usable hour          | `POOR`         |
| no usable hours, but at least one scorable hour is `POOR` | `POOR`         |
| no usable hours and all scorable hours are `UNSUITABLE`   | `UNSUITABLE`   |

Then apply:

- snow-depth daily cap;
- warm + marginal-snow interaction;
- global override.

If no 4-hour block exists because required evidence is missing rather than
because conditions are poor, return `UNKNOWN` under the sufficiency rule rather
than `POOR`.

---

# 7. Indoor sightseeing calibration

## 7.1 Internal reason categories

Activity assessments used by indoor scoring must preserve one of:

- `WEATHER`;
- `PREREQUISITE_ABSENT`;
- `STRUCTURAL_NON_APPLICABLE`;
- `INSUFFICIENT_DATA`;
- `GLOBAL_EXTREME`.

Examples:

- full-horizon marine null → `STRUCTURAL_NON_APPLICABLE`;
- skiing with credible no-snow evidence → `PREREQUISITE_ABSENT`;
- marine provider failure → `INSUFFICIENT_DATA`;
- ordinary poor rain/wind conditions → `WEATHER`.

The exact TypeScript enum name is implementation-owned.

## 7.2 Indoor sufficiency

Indoor sightseeing needs enough ordinary weather evidence to establish that the
global override does not apply and to score outdoor sightseeing for that day.

If ordinary weather evidence is insufficient for that purpose, indoor
sightseeing is `UNKNOWN`.

Marine evidence is not required for indoor sightseeing itself.

## 7.3 Indoor daily rule

Apply in this order:

1. global override → `UNSUITABLE`;
2. insufficient ordinary weather evidence → `UNKNOWN`;
3. otherwise baseline → `GOOD`;
4. upgrade to `EXCELLENT` only if all of the following are true:
   - outdoor sightseeing is below `GOOD` for reason `WEATHER`;
   - every skiing/surfing assessment that is relevant to the opportunity-cost
     comparison is below `GOOD` for reason `WEATHER`;
   - no skiing/surfing assessment is `UNKNOWN` / `INSUFFICIENT_DATA`.

The following do **not** contribute to the `EXCELLENT` boost:

- surfing `UNSUITABLE` because it is structurally non-applicable;
- skiing `UNSUITABLE` because prerequisite snow is absent;
- any outdoor activity that is `UNKNOWN`.

If skiing or surfing is structurally/prerequisite non-applicable, ignore that
activity when deciding whether weather removed good outdoor alternatives.

If an outdoor activity is `UNKNOWN`, keep indoor at `GOOD`; missing evidence is
not evidence that weather removed the opportunity.

Indoor does not use `FAIR` or `POOR` in v1.

---

# 8. Calibration scenarios

The following scenarios are part of the calibration oracle.

The internal utility score exists only to combine coarse component bands.
Scenario expectations are expressed in public categories wherever possible;
the evaluator should not treat an exact internal utility number as a product
requirement unless a test specifically targets a weighting boundary.

## 8.1 Outdoor sightseeing

1. Three dry hours at 22 °C, 10 km/h wind, 10 km visibility:
   expected window `EXCELLENT`.

2. One 1.0 mm shower hour surrounded by two dry comfortable hours:
   precipitation component may remain `GOOD`; the window must not become
   `UNSUITABLE`.

3. Three hours of 0.4 mm/h drizzle:
   cannot receive the `GOOD` precipitation score because wetHours = 3.

4. Comfortable temperature with >6 mm total / 3 h precipitation:
   precipitation component `UNSUITABLE`, final window capped at `POOR`.

5. One excellent hour only and no complete 3-hour positive window:
   cannot produce a high daily rating.

6. Light snow, light wind, good visibility:
   not automatically downgraded merely because snowfall > 0.

7. Thunderstorm code 95 during candidate window:
   window `UNSUITABLE`.

## 8.2 Surfing

1. 1.2 m wave height, 12 s swell period, 11 s combined period, 8 km/h wind:
   strong `EXCELLENT` hourly candidate before other caps.

2. Same wave height and wind, 6 s swell period:
   materially lower than scenario 1.

3. 1.2 m waves, 14 s swell period, 8 s combined period, light wind:
   receives mixed/choppy-sea penalty but is not vetoed solely by the ratio.

4. 1.2 m waves, 12 s swell period, 11 s combined period, 35 km/h wind:
   materially downgraded.

5. 4.0 m waves:
   `UNSUITABLE` for generic recreational-user model.

6. Overlapping good 2-hour slices from one continuous morning run:
   one opportunity.

7. Separate morning and evening runs:
   two opportunities.

8. One 2-hour `EXCELLENT` opportunity only:
   daily `GOOD`.

9. One >=4-hour `EXCELLENT` opportunity:
   daily `EXCELLENT`.

10. Full marine horizon null for wave height, swell period and combined period:
    structural `UNSUITABLE`.

11. One target date null but other horizon dates contain marine observations:
    no structural inference from that day alone.

12. Marine provider failure:
    `UNKNOWN`.

## 8.3 Skiing

1. Median snow depth >=0.30 m, around 0 °C, light wind, good visibility:
   strong `EXCELLENT` candidate.

2. Median snow depth <0.01 m with sufficient snow-depth evidence:
   `UNSUITABLE` regardless of pleasant weather.

3. Snow-depth evidence missing below sufficiency threshold:
   `UNKNOWN`.

4. Median snow 0.05–<0.15 m:
   daily rating cannot exceed `FAIR`.

5. Two excellent ski hours only:
   cannot produce `GOOD` or `EXCELLENT` through sustained-opportunity logic.

6. Four contiguous strong hours:
   can support a high rating.

7. Six good hours split 3 + 3 by poor conditions:
   worse than six continuous good hours because no equivalent sustained run.

8. Rain >2 mm/h:
   affected ski hour `UNSUITABLE`.

9. Persistent 35–45 km/h wind:
   strongly reduces the ski score even with excellent snow.

10. > 7 °C median temperature with <0.15 m snow:
    > daily cap `POOR`.

## 8.4 Indoor sightseeing

1. Outdoor sightseeing `EXCELLENT`, surf/ski unavailable:
   indoor `GOOD`.

2. Outdoor sightseeing `FAIR` because of weather, surf `POOR` because of
   weather, skiing structurally/prerequisite unavailable:
   indoor `EXCELLENT`.

3. Surfing `UNKNOWN` due marine provider failure:
   indoor remains `GOOD` rather than using missing surf evidence to boost.

4. Global extreme-weather override:
   indoor `UNSUITABLE`.

---

# 9. Calibration changes

Before evaluator preparation, calibration values may be changed only through
human-reviewed amendment of this file.

The amendment must record:

- the scenario that exposed the problem;
- the old rule;
- the new rule;
- why the product semantics remain unchanged.

After evaluator preparation, changing any threshold, cap, veto, sufficiency rule
or aggregation mapping in this file is a contract change.
