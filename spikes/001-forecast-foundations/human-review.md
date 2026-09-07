[human review] Reviewed the implementation and evaluator findings before repair.

The three evaluator failures are accepted as implementation defects:

- qualified location input must not resolve to geography contradicting an
  authoritative qualifier;
- provider timestamps must be semantically valid local timestamps before they
  can contribute forecast coverage;
- snapshot lifecycle metadata must retain canonical resolved-location identity.

The review also found several implementation-quality issues:

- `decisions.md` already selects Zod for runtime validation at external provider
  boundaries, but the implementation used ad-hoc validators. Replace the
  hand-written provider response validation with focused Zod schemas while
  preserving provider-specific mapping and application-owned types. This is a
  boundary-validation change, not a generic schema/framework exercise.

- Source degradation currently catches every thrown error and converts it to
  `UNAVAILABLE`. Restrict degradation to expected provider/request/validation
  failures so unexpected programming defects are not silently swallowed.

- The project declares Node >=24 <25 but currently uses `@types/node` 26.x.
  Align Node type definitions with the declared Node 24 runtime.

- Promote high-value evaluator discoveries into visible regression tests where
  doing so protects stable product/application invariants. Do not copy the
  evaluator wholesale or couple production code to evaluator-only seams.

Keep the existing brief, Design Map and prepared evaluation plan frozen.
