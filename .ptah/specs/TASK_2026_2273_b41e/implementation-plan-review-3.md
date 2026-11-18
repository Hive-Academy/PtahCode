Verdict: REVISE

- Defect 2: **Open.** F10 adds List pagination beyond 200 rows, but its claim that Graph and List show the same set when all rows are loaded is false: Graph defaults to `maxNodes: 150` and caps at 1,500 (`libs/shared/src/lib/types/rpc/rpc-memory.types.ts:208-215`), while F10 loads the entire `memory:list` result. Define List membership relative to the graph cap, or explicitly state and test the intended difference.
- R7: **Correct.** `resolveReadScope` returns `undefined` for `scope: 'all'`, preserves an explicit string or `null`, and otherwise uses the host root or `null` (`libs/backend/rpc-handlers/src/lib/handlers/memory-rpc.handlers.ts:245-252`).
- F9: **Correct.** Sending `{ scope: 'all' }` without a root and sending the workspace root for `scope: 'workspace'` follows that handler rule (`memory-rpc.handlers.ts:245-252`).
