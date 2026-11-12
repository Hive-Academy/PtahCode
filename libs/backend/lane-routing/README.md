# @ptah-extension/lane-routing

Host-neutral decision-model lane routing.

The phase contract accepts 12 kinds, including `batch` and `completion`. These two
kinds use lane candidates when available; with no lane or explicit role, the
roster marks them unavailable for orchestrator execution. `resolvePhaseDefinition`
strictly parses a caller-supplied phase document and returns its discipline and
tool profile without invoking an executor.

This library holds the route-decision tokens, the routing thresholds, the route service and the
structural logger the hosts pass in. It may import only `@ptah-extension/shared` and
`@ptah-extension/platform-core`. It does not import `@ptah-extension/vscode-core`.
`platform-core` has no logger token, so logging is the local `LaneRoutingLogger` interface
(`debug`, `info`, `warn`, `error`).

Public surface is `src/index.ts`: tokens, `registerLaneRoutingServices`, ports, `RouteDecideService`
and the decision-model settings DTOs. Ranking, rotation, matrix diagnostics and the failure
classifier stay inside the library.

| Export | File |
| --- | --- |
| `LANE_ROUTING_TOKENS` | `src/lib/di/tokens.ts` |
| `registerLaneRoutingServices` | `src/lib/di/register.ts` |
| `RouteDecideService` | `src/lib/route-decide.service.ts` |
| `LaneRoutingLogger` | `src/lib/lane-routing-logger.ts` |

## Tests

```bash
npm run verify -- -t test -p lane-routing
```
