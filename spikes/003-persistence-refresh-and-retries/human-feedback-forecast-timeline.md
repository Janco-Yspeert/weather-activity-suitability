Human feedback — provider request horizon around local midnight

I noticed this issue originally when Spike 002 introduced
`forecast_days=8` for sunrise/sunset alongside `forecast_hours=195`.

Those two Open-Meteo controls have different semantics:

- `forecast_days` is destination-calendar based and starts from 00:00 on the
  current local date;
- `forecast_hours` is rolling from the current hour.

The 195-hour request was intentional: it is seven required future days plus
enough additional hourly range that a snapshot fetched late in the local day
can remain useful if the seven-day target window advances at midnight during
the three-hour freshness period.

This means the application request horizon cannot simply be recorded as the
current seventh target date, but it also cannot unconditionally be recorded as
the ninth `forecast_days` date.

For example:

- a request around midday with `forecast_hours=195` does not contain a complete
  extra eighth future day, even if `forecast_days=9` supplies sunrise/sunset for
  that date;
- a request late in the evening may contain that complete extra future day and
  can legitimately remain window-compatible across the local midnight rollover.

The persisted `requestedThroughDate` should therefore describe the last complete
destination-local day that the provider request was _intended to support across
the required source inputs_, not merely `targetDates.at(-1)`, the last returned
timestamp, or the last `forecast_days` date.

Do not derive this from actual returned coverage: a successfully validated
partial response must still be cached rather than causing repeated refreshes.

For simplicity, I am comfortable requesting `forecast_days=9` on every weather
request. The extra sunrise/sunset row is cheap and avoids dynamically changing
the provider request shape. `requestedThroughDate` should still only advance to
the extra day when the rolling hourly request was intended to cover that day
completely.

Please treat this as a small correction to the Spike 003 horizon implementation,
not a reopening of the activity-scoring or DST model.
