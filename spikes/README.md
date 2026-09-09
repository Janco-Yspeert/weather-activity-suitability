# Spikes

These folders contain the main implementation slices used while working through
the exercise.

They are intentionally kept as development artifacts rather than rewritten into
polished documentation. Each spike captures the brief or assumptions at that
point, implementation notes, evaluator preparation/results, and any decisions
that changed while the work was in progress.

The three main spikes are:

- `001-forecast-foundations` — location resolution, Open-Meteo boundaries,
  seven-day forecast semantics, GraphQL shape, and the initial provider model.
- `002-activity-scoring` — the activity-specific suitability models and
  calibration for skiing, surfing, outdoor sightseeing and indoor sightseeing.
- `003-persistence-refresh-and-retries` — SQLite persistence, cache freshness,
  refresh/fallback behaviour, provider retries, and runtime integration.

The spike artifacts are not all equally authoritative. Where there is a
conflict, the intended order is:

`source-brief.md` → root `brief.md` → spike brief

`decisions.md` and `WORKLOG.md` provide additional context around why particular
choices were made or later revised.

For a quick overview of the finished service, start with the root
[`README.md`](../README.md). The spike folders are mainly there for anyone who
wants to follow how the implementation and assumptions evolved.
