# Implementation Report — Spike 001 — Forecast Foundation

Status: IMPLEMENTED

## Files and behavior changed

- `src/forecast-policy.ts` calculates seven complete destination-local future dates, derives actual coverage from provider timestamps, and exposes storage-independent fresh/stale eligibility policy.
- `src/open-meteo.ts` resolves supported populated places and fetches hourly forecast coverage through runtime-validated Open-Meteo boundaries.
- `src/forecast-service.ts` assembles the foundation response and coalesces simultaneous forecast refreshes by canonical provider location ID.
- `src/graphql.ts` exposes the agreed query, location, metadata, target-date, and activity-rating shapes as an executable GraphQL schema.
- `src/index.ts` composes the production schema with the Open-Meteo client.
- Focused tests cover date-window and lifecycle boundaries, provider validation/mapping, coalescing and cleanup, partial coverage metadata, placeholder ratings, and GraphQL execution.

## Consequential implementation decisions

- The service records `fetchedAt` after a successful provider response. A failed operation therefore cannot accidentally acquire snapshot metadata or look reusable.
- The in-flight registry owns only forecast refreshes, not geocoding requests. Canonical identity is unavailable until resolution completes; once known, aliases resolving to the same provider ID share the same forecast promise. A guarded `finally` removes both fulfilled and rejected operations.
- The adapter requests 195 hourly temperature observations as the smallest concrete Open-Meteo time series needed to obtain local timestamps. Coverage is derived solely from timestamps actually returned. Temperature is not exposed or interpreted by this spike.
- The provider boundary uses small explicit validators rather than adding Zod for two narrow DTOs. This preserves the required runtime boundary without adding a dependency before the eventual forecast observation model is known.
- GraphQL is exposed as a composed executable schema without selecting an HTTP transport. Transport does not affect this spike's operation or response contract and can be added when the runnable delivery surface is addressed.

## Bounded discovery

The current official Open-Meteo documentation confirms that geocoding accepts the full qualified query in `name`, returns provider ID, GeoNames feature code, coordinates, and IANA timezone, and that the forecast endpoint accepts an IANA `timezone`, returns local hourly timestamps, and supports `forecast_hours`. Those facts define the adapter request and validation boundary.

## Tests and checks

- `npm test`: 5 files passed, 16 tests passed.
- `npm run typecheck`: passed under strict TypeScript settings.
- `git diff --check`: passed.

No live-provider smoke test was run; provider behavior is isolated behind deterministic boundary tests, and the external request contract was checked against the official documentation.
