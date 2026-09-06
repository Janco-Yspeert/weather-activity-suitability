# Spike 001 — Forecast Foundation

## Parent contract

This spike inherits `../../brief.md`.

It implements a bounded foundation for the final service. It does not complete
the activity-ranking requirement.

## Goal

Establish the location, forecast-window, provider-boundary and GraphQL contracts
needed by later activity scoring.

## Required behaviour

Given a city or town input, the service must:

- resolve it to a canonical provider-backed location;
- return the resolved location in the response;
- calculate the seven complete future calendar dates in the destination timezone;
- fetch the Open-Meteo data needed to establish forecast coverage;
- runtime-validate provider responses before mapping them into application-owned types;
- determine whether the returned forecast data covers the required dates;
- expose the agreed GraphQL response shape;
- return `UNKNOWN` activity ratings for the seven dates.

The `UNKNOWN` values are explicit placeholders for this spike and do not satisfy
the final activity-ranking requirement.

## Forecast lifecycle in this spike

This spike must establish the concepts of:

- canonical snapshot identity;
- `fetchedAt`;
- actual forecast coverage;
- three-hour freshness;
- 24-hour stale-fallback eligibility;
- same-location refresh coalescing.

The final persisted forecast payload is not part of this spike.

Durable forecast storage will be implemented only after the activity methodology
has established which observations must survive persistence.

## Out of scope

- activity scoring heuristics;
- final forecast persistence schema;
- final storage technology;
- activity-specific minimum-data rules;
- resort, surf-break or attraction availability;
- distributed refresh coordination.

## Acceptance criteria

- a supported city/town resolves to a canonical location;
- the target dates are seven complete destination-local future dates;
- malformed Open-Meteo responses fail at the provider boundary;
- insufficient provider coverage is detected rather than assumed;
- GraphQL returns the resolved location, target dates and `UNKNOWN` outcomes;
- simultaneous refreshes for the same canonical location do not issue duplicate
  provider requests within one service instance;
- tests cover the destination-timezone/date-window and provider-boundary behaviour.
