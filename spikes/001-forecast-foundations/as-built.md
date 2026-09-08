# As-Built — Spike 001 — Forecast Foundation

Status: ALIGNED

## Implemented shape

The candidate is a TypeScript, ESM forecast foundation with an executable
GraphQL schema. A `forecast(location: String!)` query resolves a populated
place through Open-Meteo, derives its seven complete future dates in that
location's IANA timezone, obtains weather and marine source data, and returns
the resolved location, date-aligned activity placeholders, and independently
observable source metadata.

`OpenMeteoClient` is the provider boundary. It keeps provider request fields
and DTOs local, accepts application-selected `airTemperature` and `waveHeight`
observations, translates them to Open-Meteo fields, parses response bodies from
`unknown` with Zod, and maps successful data to application-owned location and
source-forecast types. Geocoding accepts the configured populated-place codes;
comma-separated geographical qualifiers are enforced against provider country
and administrative fields, while Open-Meteo remains responsible for base-name
search relevance.

`ForecastService` starts weather and marine acquisition together. Expected
provider request/response failures become an unavailable result for that
source only; unexpected errors propagate. It derives source coverage from
returned destination-local timestamps whose requested observation has a
non-null value, limited to the requested target window. This produces
`AVAILABLE`, `PARTIAL`, `NO_DATA`, or `UNAVAILABLE` plus the ordered covered
target dates. All four activity arrays remain seven aligned `UNKNOWN` values.

In-flight source acquisition is coalesced by canonical provider location ID
for the lifetime of the operation. Settlement, including a degraded result or
rejection, removes that identity so a later request can refresh again.

## Lifecycle policy and retained boundaries

The storage-independent policy represents snapshot ownership by canonical
location ID, actual coverage, and `fetchedAt`. Normal reuse requires matching
identity, complete required-date coverage, and age below three hours. A stale
fallback has the same identity and coverage requirement and is eligible
through 24 hours. The request path deliberately does not load, persist, reuse,
or return stale snapshots.

The adapter requests a 195-hour horizon and the minimal representative
observations only. It validates semantic local timestamps, including real
destination-local calendar/time values, and permits provider null observation
values. A date does not require 24 records to be representable; 23- and
25-hour local DST days are supported by date-based coverage calculation.

HTTP transport, durable forecast storage, request-time snapshot reuse and
stale fallback, distributed coordination, the final observation set, and
activity scoring are absent by design. `NO_DATA` remains source evidence only;
it is not converted to `UNSUITABLE` or any other activity conclusion.

## Contract comparison

No Missing, Contradictory, or Extra material findings. The accepted candidate
matches the Spike 001 brief and Design Map, including the independent marine
boundary and degraded-source contract.
