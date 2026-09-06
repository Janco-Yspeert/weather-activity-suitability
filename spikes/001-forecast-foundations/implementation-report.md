# Implementation Report — Spike 001 — Forecast Foundation

Status: IMPLEMENTED

## Files and behavior changed

- `src/forecast-policy.ts` calculates seven complete destination-local future dates, derives timestamp coverage, and exposes storage-independent fresh/stale eligibility policy.
- `src/open-meteo.ts` resolves supported populated places and independently fetches and runtime-validates ordinary weather and marine data. Application observation names are translated to provider fields at this boundary.
- `src/forecast-service.ts` selects Spike 001's representative observations, acquires both sources independently, distinguishes successful no-data responses from failures, calculates usable target-window coverage, exposes per-source availability, and coalesces simultaneous refreshes by canonical provider location ID.
- `src/graphql.ts` exposes weather and marine `AVAILABLE`, `PARTIAL`, `NO_DATA`, or `UNAVAILABLE` records and their covered dates alongside the location, target dates, and placeholder activity ratings.
- Focused tests cover date and lifecycle boundaries, both provider adapters, observation translation, nullability, source degradation, per-source coverage/state, refresh coalescing and cleanup, and GraphQL execution.

## Consequential implementation decisions

- A target date counts as usable source coverage when at least one returned timestamp on that date has a non-null value for a requested representative observation. A successful source with no usable observations in the target window is `NO_DATA`; this preserves positive evidence of absence for Spike 002 without prematurely implementing activity scoring.
- Weather and marine requests begin together and settle independently. A rejected or malformed source becomes `UNAVAILABLE`, distinct from `NO_DATA`, and does not discard valid data from the other source.
- One canonical-location in-flight operation owns both source requests. Aliases resolving to the same provider location share that operation, and a guarded `finally` releases fulfilled or degraded operations so later requests refresh again.
- The application currently selects `airTemperature` and `waveHeight`; the adapter translates these to `temperature_2m` and `wave_height`. The 195-hour provider horizon remains adapter-owned, while the selected observations do not.
- The provider boundary retains small explicit validators rather than adding a validation dependency for the two narrow source DTOs.

## Bounded discovery

Official Open-Meteo documentation established that the weather and marine endpoints both accept `timezone`, `hourly`, and `forecast_hours`, return destination-local hourly timestamps, and represent unavailable observation values as nulls.

Live Cape Town probes then verified both boundaries. The exact production-shaped `forecast_hours=195` requests returned 195 aligned timestamps and values from each endpoint, echoed `Africa/Johannesburg`, and covered `2026-09-07T00:00` through `2026-09-15T02:00`. Weather and marine returned different model grid coordinates, so neither source grid coordinate is used as canonical location identity.

## Tests and checks

- `npm test`: 5 files passed, 20 tests passed.
- `npm run typecheck`: passed under strict TypeScript settings.
- Live Open-Meteo weather and marine smoke requests: passed.
- `git diff --check`: the implementation changes are clean, but the repository check still reports pre-existing trailing whitespace in the earlier human-authored `WORKLOG.md` entry 13. The append-only worklog rule prevents rewriting that entry during this phase.

The live provider check is bounded discovery, not part of the deterministic test suite. HTTP transport, durable snapshot reuse, stale request-path fallback, and activity scoring remain deferred by the spike contract.

The explicit implementation feedback adds `NO_DATA` and supersedes the READY Design Map's earlier rule that collapsed every successful empty target-window result into `UNAVAILABLE`. The brief and Design Map were not modified because this phase may change only implementation, visible tests, the implementation report, and the append-only worklog.
