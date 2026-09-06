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

This spike establishes the application-level forecast lifecycle contract:

- snapshots are associated with a canonical resolved location;
- snapshots record `fetchedAt`;
- snapshots record their actual forecast coverage;
- normal reuse requires both sufficient coverage and age < 3 hours;
- after refresh failure, a snapshot may be used as stale fallback while
  age <= 24 hours, provided it still has sufficient coverage.

Spike 001 does not implement snapshot reuse or stale fallback in the request
path.

Durable forecast storage and the runtime behaviour that depends on it are
deferred until the activity methodology establishes which forecast
observations must be retained.

The freshness, coverage and stale-fallback rules should be represented as
application-owned policy and may be tested independently of storage.

## Refresh coalescing

Same-location provider refreshes must be coalesced in-process in this spike.

This behaviour does not depend on persisted snapshot reuse: if concurrent
requests require the same provider fetch, they should share the same in-flight
operation.

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
- actual provider coverage is calculated rather than inferred from the
  requested horizon;
- freshness and stale-fallback eligibility are represented by storage-
  independent application policy and have focused tests;
- GraphQL returns the resolved location, target dates and `UNKNOWN`
  placeholder outcomes;
- simultaneous provider refreshes for the same canonical location are
  coalesced within one service instance;
- request-time persisted snapshot reuse and stale fallback are not required
  by this spike.
