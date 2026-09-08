# Spike 002 implementation report

Status: IMPLEMENTED

## Changed

- Added a pure activity-scoring module that evaluates the accepted global,
  outdoor sightseeing, surfing, skiing, and indoor sightseeing calibration for
  each target date. Internal assessment reasons remain private and distinguish
  weather, missing prerequisites, structural marine non-applicability,
  insufficient evidence, and global extremes.
- Expanded the application-owned Open-Meteo observation selection and mapping
  to the complete v1 weather and marine inputs. Weather forecasts now include
  validated, date-keyed sunrise and sunset values; marine forecasts retain the
  full fetched horizon.
- Replaced unconditional activity placeholders in `ForecastService` with the
  aligned scoring results while preserving independent source acquisition,
  availability metadata, provider-error degradation, and refresh coalescing.
- Added visible calibration tests for global precedence, outdoor window
  sufficiency and caps, surf opportunities and structural nulls, ski snow
  evidence and caps, and indoor opportunity-cost behavior. Provider and live
  integration tests now exercise the expanded observation contract.

## Consequential implementation decisions

- Scoring is implemented as pure functions over canonical forecasts. This
  keeps provider DTOs out of the methodology and makes threshold, continuity,
  coverage, cap, and veto behavior deterministic under the existing injected
  provider and clock seam.
- Capped surf and ski hourly utility is retained for session aggregation. This
  prevents a capped hazardous or marginal hour from regaining a higher rating
  when averaged into a sustained opportunity.
- `SourceForecast` remains strict over its selected generic observation keys.
  Old partial test fixtures are tolerated only where they deliberately model
  incomplete evidence; the production boundary was not weakened to make those
  fixtures appear complete.

## Rejected complexity

- A partial-record canonical forecast was briefly considered for compatibility
  with old one-field fixtures. It was rejected because it would weaken the
  application/provider contract and make missing requested series a normal
  typed state instead of a boundary-validation failure.
- No scoring class hierarchy, persistence layer, astronomy dependency, or
  provider-generalization framework was added. Pure activity-specific helpers
  are sufficient for the fixed v1 calibration.

## Bounded discovery

- Open-Meteo's official forecast documentation states that daily data defaults
  to seven days, independently of the hourly horizon controls. Since the
  product's seven future dates require today plus seven days of solar data, the
  weather request explicitly sets `forecast_days=8` while retaining the
  inherited `forecast_hours=195` hourly horizon.
- A live Open-Meteo run confirmed the complete weather/marine field mapping,
  aligned arrays, target-date hourly coverage, and sunrise/sunset coverage for
  every target date.

## Verification

- `npm test` — 38 deterministic tests passed.
- `npm run typecheck` — passed.
- `npm run test:integration` — 4 live Open-Meteo tests passed with network
  access. An initial sandboxed run failed only because DNS was unavailable.
- `git diff --check` — passed.

No independent evaluator was run or claimed by this phase.
