# Weather Activity Suitability

A small TypeScript/GraphQL service that uses Open-Meteo forecasts to assess the
next seven full days for:

- skiing
- surfing
- outdoor sightseeing
- indoor sightseeing

The output is deliberately categorical (`UNKNOWN` through `EXCELLENT`) rather
than pretending the underlying heuristics are more precise than they are.

Ratings assess forecast weather and marine conditions at the resolved location.
They are not safety assessments and do not confirm that the activity, suitable
terrain, facilities or local access exist.

The original assignment is [`source-brief.md`](./source-brief.md). The
chronological working trail is [`WORKLOG.md`](./WORKLOG.md), current decisions
are in [`decisions.md`](./decisions.md), and the staged implementation and
evaluation artifacts are under [`spikes/`](./spikes/).

## Running

Requires Node.js 24.

```bash
npm install
npm test
npm run typecheck
npm start
```

The GraphQL endpoint is available by default at:

```text
http://127.0.0.1:4000/graphql
```

Exgample usage is:

```bash
curl http://127.0.0.1:4000/graphql \
  -H 'content-type: application/json' \
  --data '{"query":"{ forecast(location: \"Cape Town\") { dates skiing surfing outdoorSightseeing indoorSightseeing } }"}'
```

The service stores resolved locations and forecast snapshots in a local SQLite
database (`weather.sqlite` by default).

The following environment variables can be used if needed:

- `WEATHER_DATABASE_PATH` — SQLite database path
- `HOST` — server host, default `127.0.0.1`
- `PORT` — server port, default `4000`

There is also an opt-in live Open-Meteo integration suite:

```bash
npm run test:integration
```

The normal test suite does not depend on external network availability.

## API

The API exposes a GraphQL `forecast(location: String!)` query.

For example:

```graphql
query {
  forecast(location: "Cape Town") {
    location {
      name
      country
      timezone
    }

    dates

    skiing
    surfing
    outdoorSightseeing
    indoorSightseeing

    metadata {
      weather {
        state
        coveredDates
        fetchedAt
        stale
      }
      marine {
        state
        coveredDates
        fetchedAt
        stale
      }
    }

    dailyAdvisories {
      date
      codes
    }

    forecastAdvisories
  }
}
```

The location returned is the location actually resolved by the provider. This is
particularly useful for ambiguous names.

## A few decisions worth knowing about

The seven dates are complete future calendar days in the resolved location's
timezone, starting tomorrow. I excluded the current day because a partly elapsed
day is difficult to compare fairly with the following six complete days.

Weather and marine forecasts have independent persistence and refresh
lifecycles. Successful data is cached in SQLite and normally reused for three
hours. Provider failures are retried where they look transient, and recent
persisted data can be used as a stale fallback when a refresh fails.

Actual data coverage is kept separate from cache freshness. A provider response
can therefore be successfully cached while still containing too little evidence
to rate a particular activity.

Missing or insufficient evidence generally produces `UNKNOWN`. `UNSUITABLE` is
reserved for conclusions the available evidence can actually support: for
example sufficiently evidenced lack of snow, structurally unavailable marine
data, flat surf conditions, or severe weather.

The activity models are intentionally different rather than using one generic
weather score:

- Surfing looks for usable sessions within the day. Wave height, swell period
  and wind matter, and bigger waves are not automatically better.
- Skiing is treated more like a substantial daytime activity and requires
  evidence of snow before ordinary weather quality is considered.
- Outdoor sightseeing looks for worthwhile contiguous daytime periods rather
  than simply averaging the whole day.
- Indoor sightseeing has a high baseline. Poor outdoor weather can make it more
  attractive, but pleasant weather does not make indoor sightseeing inherently
  bad.

I used a mixture of published weather/activity guidance, some basic knowledge of
the activities, and explicit product judgement to set the heuristics. The
calibration and supporting research are kept under `spikes/` rather than being
repeated here.

The exact thresholds, coverage rules and calibration are documented under
`spikes/002-activity-scoring/`.

This is a **weather-suitability** service, not an activity-availability or safety
service. Open-Meteo cannot tell me whether a ski resort, surf break or attraction
actually exists at the resolved location. In particular, a positive skiing or
surfing rating should not be read as confirmation that the activity is available
or safe there.

## Ranking system

The public ratings are ordinal:

`UNKNOWN`, `UNSUITABLE`, `POOR`, `FAIR`, `GOOD`, `EXCELLENT`

`UNKNOWN` means the service does not have enough trustworthy evidence to make a
rating.

`UNSUITABLE` means there is enough evidence for the service not
to recommend that activity under the model being used.

`POOR` through `EXCELLENT` describe increasingly favourable weather suitability.
Internal numeric values are used in a few places to combine evidence, but these
are implementation utilities rather than confidence scores and are deliberately
not exposed through the API.

## Development process

I used AI heavily throughout the exercise: for planning, research,
implementation, adversarial evaluation and code review. I tried to keep product
decisions human-owned rather than simply accepting whatever an agent produced.

That process is intentionally left visible in the repository. `WORKLOG.md`
records decisions, changes of mind, evaluator findings, cuts and corrections.
The `spikes/` directories contain the evolving briefs, design maps, calibration
and evaluation artifacts. There are a couple of places where agent-generated
solutions became more complicated than I thought the problem justified,
particularly around DST handling, and those were deliberately simplified again.

I used a lightweight version of my own experimental AI-development workflow for
the exercise. The skills are under `skills/`. It is still a work in progress:
there is a genuine tension between a disciplined staged workflow and the need to
make small obvious changes quickly, which came up a few times during this
exercise.

Selected AI-assisted product discussions are preserved in
[`AI-CONVERSATIONS.md`](./supporting-docs/AI-CONVERSATIONS.md). They are curated
excerpts rather than raw chat transcripts. A longer chat around product decisions
is available verbatim at `https://chatgpt.com/share/6aa0ff15-7258-83ea-8095-5873690bc73c`

## Deliberate limits

I kept this as a single-process take-home service. I did not add distributed
refresh locking, background jobs, production database infrastructure, a front
end, or a generic multi-provider weather abstraction.

There are also things I would improve with more time — particularly richer
location/activity availability information and more location-aware calibration
of what counts as pleasant weather — but I preferred to keep those uncertainties
visible rather than make the submitted service larger for their own sake.
