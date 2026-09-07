# Implementation Report — Spike 001 — Forecast Foundation

Status: IMPLEMENTED

## Files and behavior changed

- `src/forecast-policy.ts` calculates seven complete destination-local future dates, derives timestamp coverage, and exposes storage-independent fresh/stale eligibility policy that verifies canonical snapshot location identity.
- `src/open-meteo.ts` resolves supported populated places, enforces authoritative qualifiers, and independently fetches and Zod-validates ordinary weather and marine data, including semantic destination-local timestamps. Application observation names are translated to provider fields at this boundary.
- `src/forecast-service.ts` selects Spike 001's representative observations, acquires both sources independently, distinguishes successful no-data responses from expected provider failures, propagates unexpected defects, calculates usable target-window coverage, exposes per-source availability, and coalesces simultaneous refreshes by canonical provider location ID.
- `src/graphql.ts` exposes weather and marine `AVAILABLE`, `PARTIAL`, `NO_DATA`, or `UNAVAILABLE` records and their covered dates alongside the location, target dates, and placeholder activity ratings.
- `package.json` and `package-lock.json` add Zod and align `@types/node` with the declared Node 24 runtime.
- Focused tests cover qualified-location contradictions, semantic timestamps, canonical snapshot ownership, expected versus unexpected source failures, date and lifecycle boundaries, both provider adapters, observation translation, nullability, source degradation, per-source coverage/state, refresh coalescing and cleanup, and GraphQL execution.

## Consequential implementation decisions

- A target date counts as usable source coverage when at least one returned timestamp on that date has a non-null value for a requested representative observation. A successful source with no usable observations in the target window is `NO_DATA`; this preserves positive evidence of absence for Spike 002 without prematurely implementing activity scoring.
- Weather and marine requests begin together and settle independently. Expected request or validation failures use a shared `ProviderError` family and become `UNAVAILABLE`, distinct from `NO_DATA`; unexpected errors propagate rather than being disguised as external degradation.
- One canonical-location in-flight operation owns both source requests. Aliases resolving to the same provider location share that operation, and a guarded `finally` releases fulfilled or degraded operations so later requests refresh again.
- The application currently selects `airTemperature` and `waveHeight`; the adapter translates these to `temperature_2m` and `wave_height`. The 195-hour provider horizon remains adapter-owned, while the selected observations do not.
- Qualified inputs are matched case-, punctuation-, and diacritic-insensitively against the provider's country code, country, and administrative hierarchy. All supplied comma-separated qualifiers must match; no speculative geography alias database is introduced, so an unrecognised abbreviation fails safely rather than selecting contradictory geography.
- Zod schemas define the provider DTO boundary. Timestamp refinements reject normalized-but-impossible dates, invalid clock values, and local times that cannot exist in the destination timezone before application mapping or coverage calculation.

## Bounded discovery

Official Open-Meteo documentation established that the weather and marine endpoints both accept `timezone`, `hourly`, and `forecast_hours`, return destination-local hourly timestamps, and represent unavailable observation values as nulls.

Live Cape Town probes then verified both boundaries. The exact production-shaped `forecast_hours=195` requests returned 195 aligned timestamps and values from each endpoint, echoed `Africa/Johannesburg`, and covered `2026-09-07T00:00` through `2026-09-15T02:00`. Weather and marine returned different model grid coordinates, so neither source grid coordinate is used as canonical location identity.

## Tests and checks

- `npm test`: 5 files passed, 26 tests passed.
- `npm run typecheck`: passed under strict TypeScript settings.
- `npm ls --depth=0`: dependency tree valid with Zod 4.5.4 and `@types/node` 24.13.3.
- Live Open-Meteo weather and marine smoke requests: passed.
- `git diff --check`: passed.

The live provider check is bounded discovery, not part of the deterministic test suite. HTTP transport, durable snapshot reuse, stale request-path fallback, and activity scoring remain deferred by the spike contract.

The accepted evaluator findings drove focused regressions for qualifier enforcement, semantic timestamps, and snapshot identity. Human review additionally corrected the boundary-validation dependency, error classification, and Node type-version mismatch. No evaluator-private checks or diagnostics were used as implementation inputs.
