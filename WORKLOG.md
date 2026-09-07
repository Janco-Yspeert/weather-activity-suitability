Note: For most skills, ChatGPT at Terra-Medium was used.

1. Conversation with AI, discussing open-meteo capabilities, product decisions, and workflow. (Extracts at...)
2. Established the Node 24, npm, TypeScript ESM, and Vitest baseline; GraphQL server and persistence choices remain deferred until their work items define concrete seams.
3. Brief-readiness review completed: activity methodology and submission requirements must be resolved or explicitly scoped before independent implementation of the complete take-home.
4. Updated brief-readiness review completed: delivery requirements are retained, but the main brief still requires either the activity methodology or a bounded forecast-foundation work item before independent implementation can proceed.
5. Main brief readiness review completed: the documented forecast-foundation and later scoring stages make the main brief suitable as the parent contract; Spike 001 itself was not reviewed.
6. Spike 001 brief-readiness review completed: freshness and stale-fallback behavior need an explicit in-memory-versus-contract scope decision before independent implementation.
7. Spike 001 brief-readiness review completed: storage-independent lifecycle policy and deferred request-time persistence behavior now provide a bounded implementation contract.
8. Human noted - The product brief is not intended for implementation, merely the contract for the full product. Continuing with bounded implementation
9. Spike 001 design map completed: date-aligned GraphQL placeholders, canonical-location identity, validated provider boundary, storage-independent lifecycle policy, and in-process refresh coalescing are the shared contracts; persistence and scoring remain deferred.
10. Spike 001 evaluator preparation completed: the falsification plan covers canonical resolution, destination-local dates, runtime provider validation, actual coverage, lifecycle thresholds, GraphQL placeholders, and refresh coalescing; evaluator-authored checks were deferred because the contract intentionally leaves executable composition seams free.
11. Spike 001 implementation completed: added the destination-local window and lifecycle policy, validated Open-Meteo adapter, canonical-location refresh coalescing, executable GraphQL schema, and focused tests; durable snapshot use, activity scoring, and HTTP transport remain outside this spike.
12. Human noted implemetation explicitly left out: No live-provider smoke test was run; provider behavior is isolated behind deterministic boundary tests, and the external request contract was checked against the official documentation.
13. [human review] Spike 001's minimal forecast implementation exposed an
    ambiguity in the spike contract: it established only the weather provider
    boundary, although the final product already requires independent marine
    evidence for surfing.  
     Decided that Spike 001 should establish both weather and marine provider
    boundaries, while still deferring the final observation set and activity
    methodology to Spike 002.
14. Spike 001 brief-readiness review completed: the new marine boundary needs a
    minimum public degraded-data representation before independent implementation
    and evaluation can proceed.
15. Spike 001 brief-readiness review completed: source availability state and
    per-source coverage now make degraded marine results independently observable.
16. Spike 001 design map revised: weather and marine are independent validated
    provider boundaries, with per-source target-window coverage and
    `AVAILABLE`/`PARTIAL`/`UNAVAILABLE` metadata as a public contract.
17. Spike 001 evaluator preparation repeated for the revised contract: the plan
    now independently falsifies weather and marine validation, nullability,
    coverage/state metadata, degraded marine responses, and coalesced source
    acquisition without fixing the old implementation's names or seams.
18. [human review] Noticed the Spike 1 provider client had embedded
    `temperature_2m` directly in its request construction. Kept the minimal
    observation set, but moved selection to the application side so the provider
    adapter does not determine future heuristic inputs.
19. Revised Spike 001 implementation completed: added independently validated weather and marine acquisition, application-selected observation translation, target-window source availability metadata, degraded-source handling, and exact 195-hour live provider probes; existing lifecycle, location, date-window, coalescing, and placeholder-rating contracts remain intact.
20. Spike 001 implementation feedback applied: successful source responses with no usable target-window observations now report `NO_DATA`, while request or validation failures remain `UNAVAILABLE`; Spike 001 ratings stay `UNKNOWN` so later scoring can distinguish absence evidence from uncertainty.
21. [human review] Found that source availability collapsed provider failure and a successful all-null marine response into the same UNAVAILABLE state. These have different downstream semantics: provider failure may yield UNKNOWN, while successful absence of marine observations may support UNSUITABLE. Added a distinct successful-no-data source state.
22. Spike 001 verification blocked as `CONTRACT_CHANGED`: implementation feedback added public `NO_DATA` semantics that contradict the READY Design Map and prepared oracle, while the observation-selection ownership requirement was also added after preparation. Contract update and evaluator re-preparation are required before judging the candidate.
23. Spike 001 brief-readiness review completed: `NO_DATA` now distinguishes a
    valid source response with no usable target-date observations from source
    unavailability, without changing activity-rating semantics.
24. Spike 001 design map revised: source metadata now distinguishes successful
    empty evidence (`NO_DATA`) from source unavailability, and application-owned
    observation selection is separated from Open-Meteo field translation.
25. Spike 001 evaluator preparation repeated after the contract update: the existing plan now covers the four-state source oracle, keeps `NO_DATA` separate from activity suitability, and falsifies application-owned observation selection without fixing observation names.
26. Spike 001 evaluator verification failed: authoritative qualifiers are not enforced, impossible local timestamps cross the provider boundary, and lifecycle snapshot metadata lacks canonical-location association. The evaluator removed an accidental second-observation extensibility requirement before judging the unchanged candidate; all other prepared criteria passed.
27. [human review] Reviewed the implementation and evaluator findings before repair.
28. Spike 001 implementation repair completed: enforced authoritative location qualifiers, replaced ad-hoc provider validation with Zod schemas and semantic local timestamps, associated lifecycle metadata with canonical location identity, limited source degradation to expected provider errors, and aligned Node type definitions with Node 24.
29. Human review - The repair looks better: the evaluator defects are fixed in the right layers, Zod now guards the open-meteo boundary, unexpected programming errors are no longer swallowed, and the Node typings match the declared runtime. The main remaining improvement I see is type-level: SourceForecast still erases the observation key type with Record<string, ...>, so preserving that generic through the return type would tighten the contract nicely. Two smaller follow-ups are worth noting: the qualifier matcher currently validates only the comma-separated qualifiers, not the base place name itself, and the DST-aware timestamp validator deserves one explicit DST spring-forward regression test.
30. Human implementation - implemented stronger generic typing contracts around Observations, added minor tests around coverage if a day has only 23 hours, or 25 - this might happen with DST. Added some basic integration tests that use actual open-meteo calls rather than mocks. These are not run by default. Decided that we will trust open-meteo look-up of place names, not insist on equality - to not enforce e.g. language differences ("Kaapstad" vs. "Cape Town").
