# Linear Connector

Linear is a connector, not the core model.

Its responsibilities are:

- map Linear issues, comments, and agent-session events into threads, jobs, and external events
- reflect Esperta Code state back to Linear as activities, comments, or state updates
- store connector-specific identifiers in connector metadata and thread links rather than in the core schema

## Connector mapping

### Source mappings

- initial Linear handoff or mention → create thread + initial job
- follow-up comment or review input → append job or attach external event
- CI or review webhook from a linked PR → attach external event to the thread

### Sink mappings

- job started / finished → Linear activity
- blocked or waiting approval → Linear activity requesting input
- publish result → PR link or branch metadata reflected back to Linear

## Storage rule

Linear-specific identifiers belong in:

- connector metadata
- `thread_links`
- `external_events`

They do not define the core thread/job schema.

## Transition note

The Linear connector implementation lives under `src/connectors/linear/`.
