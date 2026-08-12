# Public-Safe Browser Data Contract

This contract defines source-controlled defaults for browser data that is private at runtime.
It does not define a runtime migration or a public build process.

## Projection states

- `UNAVAILABLE`: the private runtime projection is not present in this environment.
- `EMPTY`: the projection loaded successfully and contains zero records.
- `LOADED`: the projection loaded successfully and contains one or more records.

`UNAVAILABLE` must never be presented as evidence that the user has no private records.

## Backend configuration

The tracked source template is `data/backend_config.js`. Its `baseUrl` is empty and its state is
`UNAVAILABLE`. Backend API calls must continue to fail closed with a configuration error.
Credentials, tokens, private endpoints, and environment-specific values are forbidden.

## AI decision review projection

The public template is `templates/public/data/ai_decision_review_data.js`. It exports
`window.AI_DECISION_REVIEW_DATA` with an explicit `UNAVAILABLE` state and empty frozen collections.
It contains no generated timestamp or runtime records.

Legacy private runtime projections remain compatible: a projection with records is inferred as
`LOADED`; a present projection with zero records and no explicit unavailable state is inferred as
`EMPTY`.

## Operation application status projection

The public template is `templates/public/data/operation_application_status_bridge.js`. It exports
`window.OPERATION_APPLICATION_STATUS` with an explicit `UNAVAILABLE` state and an empty frozen
`applications` collection.

Legacy private runtime bridges remain compatible: one or more application records are inferred as
`LOADED`; a successfully loaded bridge with no applications is inferred as `EMPTY`.

## Public-build boundary

A future public build may copy or inline only these safe templates. It must not read or copy private
runtime bridges, operation audits, validation snapshots, investment exports, or private Git history.
