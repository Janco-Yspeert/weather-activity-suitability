# Weather Activity Suitability

A small TypeScript/GraphQL service that uses Open-Meteo forecasts to assess the next seven full days for:

- skiing
- surfing
- outdoor sightseeing
- indoor sightseeing

The output is deliberately categorical (`UNKNOWN` through `EXCELLENT`) rather than pretending the underlying heuristics are more precise than they are.

## Running

Requires Node.js 24+.

```bash
npm install
npm test
npm run typecheck
```

The runnable GraphQL service is completed in the final persistence/runtime spike. Final startup and configuration instructions will be added once that implementation is complete.

## API

The API exposes a GraphQL `forecast(location: String!)` query.

Example:

```graphql
query {
  forecast(location: "Cape Town") {
    location {
      name
      country
    }
    dates
    skiing
    surfing
    outdoorSightseeing
    indoorSightseeing
    dailyAdvisories {
      date
      codes
    }
    forecastAdvisories
  }
}
```

## A few decisions worth knowing about

The seven dates are complete future calendar days in the resolved location's timezone, starting tomorrow.

Weather and marine data are treated independently. Missing data generally produces `UNKNOWN`; `UNSUITABLE` is reserved for conclusions the available evidence can actually support.

The activity models are intentionally different. Surfing looks for usable sessions, skiing requires snow as a prerequisite, outdoor sightseeing looks for worthwhile contiguous periods, and indoor sightseeing has a high baseline with an opportunity-cost boost when outdoor options are poor. Where possible, I used AI to research known heuristics for these activities. I also used some basic knowledge of the activities. Surfing is normally done in sessions when the tide/break is good. Skiing and outdoor sightseeing are more likely to be longer activities, so I looked for longer sessions where conditions were favourable.

The service persists resolved locations and forecast data in SQLite. Fresh data is reused, transient provider failures are retried, and recent stale data may be used as a fallback.

This is a weather-suitability service, not an activity-availability or safety service. It does not know whether a ski resort, surf break or attraction actually exists at the resolved location.

## Ranking system

UNKNOWN = there is not enough information available from the provider.
UNSUITABLE = there is enough information to conclude that either no activities may be possible due to severe weather, marine surfing is unavailable, or there doesn't seem to be enough snow for skiing - a city at the base of a steep mountain, may be an exception, but it did not seem sensible to say that skiing might be POOR when there is no evidence of snow depth,
The actual qualitative ratings are:
POOR, FAIR, GOOD, EXCELLENT

## Development process

I used AI heavily during the exercise, including for planning, implementation and evaluation. I tried to keep the decisions human-owned: the repository includes the briefs, calibration, evaluator artifacts and `WORKLOG.md` showing where assumptions changed, defects were found, and some agent-generated complexity was deliberately cut back. I have my own AI workflow, which I am still researching and hardening, as well as trrying to decide whether it is worth the tokens. I adopted lightweifght versions of these skills, they are shared in the `/skills` directory, and the intended workflow is detailed in `skills/workflow`. There are still some issues, and there is currently a real tension between following the workflow in the intended order and making quick, small changes as they are needed. I hope to improve on this in future.

The detailed product decisions, scoring calibration and supporting research are under `spikes/` and `decisions.md`.

A few selected AI-assisted reasoning threads are summarized in
[`AI-NOTES.md`](./AI-NOTES.md); these are deliberately curated rather than raw
chat transcripts.
