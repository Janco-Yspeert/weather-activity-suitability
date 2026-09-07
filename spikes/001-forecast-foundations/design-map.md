# Design Map — Spike 001 — Forecast Foundation

Status: READY

## Shared contracts

- The GraphQL operation accepts one city-or-town input and returns one result containing response metadata, the resolved location, seven destination-local target dates, and four date-aligned outcome sequences: skiing, surfing, outdoor sightseeing, and indoor sightseeing.
- Target dates and every outcome sequence are in the same chronological order. In this spike, every outcome is `UNKNOWN`; this is a placeholder, not an assessment or an unavailable-data signal.
- Response metadata contains independently observable weather and marine source records. Each record exposes its `AVAILABLE`, `PARTIAL`, `NO_DATA`, or `UNAVAILABLE` state and the destination-local target dates actually covered by that source.
- For a requested window, a source is `AVAILABLE` only when its usable coverage contains all seven target dates; it is `PARTIAL` when usable coverage contains a non-empty proper subset. A successfully validated source response with no usable non-null requested observation on a target date is `NO_DATA`; a source that cannot provide usable data is `UNAVAILABLE`. `NO_DATA` and `UNAVAILABLE` report no covered dates.
- A resolved location is application-owned data derived from an accepted Open-Meteo geocoding result. Its canonical provider-backed identity, rather than the caller's raw query, identifies forecast snapshots and in-flight refreshes.
- Ordinary-weather and marine Open-Meteo response bodies independently cross into the application only after runtime validation and mapping to application-owned data. Provider DTOs and raw JSON do not cross either boundary.

## Inherited contracts

- The target window is the seven complete calendar dates after the resolved location's current local date; the server or caller timezone must not affect it.
- Actual returned forecast dates determine coverage. A provider request horizon is an adapter concern, not evidence of coverage.
- Lifecycle policy associates a snapshot with its canonical location and its `fetchedAt` and actual coverage: normal reuse requires sufficient coverage and age under three hours; a refresh-failure fallback may be used only through 24 hours and still requires sufficient coverage.

## Design decisions

- Keep lifecycle eligibility as storage-independent application policy over snapshot metadata and required target dates. Spike 001 exposes and tests that policy but does not use a persisted snapshot or stale fallback on the request path.
- Coalesce provider refreshes by canonical resolved-location identity for the lifetime of each in-flight operation. Requests for distinct canonical locations must not share a refresh, even if their raw inputs resemble each other.
- Treat weather and marine acquisition as independent source outcomes. Marine failure, malformed data, or incomplete coverage produces its own non-`AVAILABLE` metadata and must not invalidate otherwise usable weather data.
- The application owns selection of the representative weather and marine observations it needs; the Open-Meteo adapter owns translation from those application observation names to provider request fields.

## Invariants

- A malformed response from either provider source fails at that source boundary; it cannot be treated as mapped data or inferred coverage.
- `NO_DATA` is a source-evidence state only. It must not be converted into an activity rating, including `UNSUITABLE`, in this spike.
- Completion of a coalesced refresh, whether fulfilled or rejected, releases its in-flight identity so a later request can initiate a new refresh.
- The foundation response must not claim activity suitability beyond `UNKNOWN`.

## Implementation freedom

- GraphQL field and type names, schema construction, HTTP server choice, dependency-injection style, date/time library, and provider-request parameters are not fixed here, provided the shared response shape and behavior remain observable.
- The canonical-location key's internal representation, policy function signatures, validation library, and the application-owned forecast model are free implementation choices.
- The representative source observations, provider request parameters, and activity-specific completeness rules remain free so long as they support boundary validation and the public source-availability contract. Durable storage, snapshot payload, request-time reuse, stale-fallback delivery metadata, and activity scoring remain deferred.
