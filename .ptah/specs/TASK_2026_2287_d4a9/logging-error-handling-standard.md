# Logging and error-handling standard (TASK_2026_2287_d4a9)

This standard applies to every site that `tools/degradation-audit/check-degradation.ts` flags.
It uses only the mechanisms the repo already has. Lanes add no shared helper, no package, no
new DI token, no new `DegradationSource` value and no new file. Each lane stays inside its own
files.

## Rule zero: do not change behaviour

**Never change the fallback value or the control flow that a caller relies on.** This sweep
makes failures visible. It does not change what the code returns.

- Keep `return null` / `false` / `[]` / `undefined` / `''` exactly as it is.
- Do not add a `throw` where the old code returned a value (see Outcome B for the narrow
  exceptions).
- Do not move a `return`, reorder statements, widen or narrow a `try`, or change a signature
  a caller sees. One exception: you may add a trailing **optional** logger parameter
  (Outcome E).
- Do not make a log call able to throw. Use `error instanceof Error ? error.message :
  String(error)`, never `error.message` on an `unknown`.
- If the honest fix needs a behaviour change, do not make it. Annotate the site, then list it
  in your lane report under **"behaviour change needed"** with file:line and one sentence.

## 1. What the detector accepts

Know these rules before you choose an outcome. A fix that only dodges the detector is a
defect.

| Kind | Flagged when | Cleared by |
|---|---|---|
| `catch-return-sentinel` | A `catch` block that has no `throw` and no call to a method named `.error(...)`, and reaches `return <literal>` (`null`, `true`, `false`, `undefined`, bare `return;`, a string, `[]`, `{}`) | a `throw`; any `x.error(...)` call (`this.logger.error`, `logger.error`, `console.error`); a valid marker |
| `promise-catch-sentinel` | `.catch(h)` where `h` is an empty block, a single `return <literal>` statement, an expression-body literal (`() => null`), or an identifier that does not resolve in this file to a function that throws or calls `.error(...)` | a handler with real statements (for example a `logger.warn(...)` and then the return); a valid marker |
| `floating-promise` | a bare statement that calls an `async` function declared **in the same file**, only in `apps/ptah-electron/src`, `libs/backend/thoth-runtime/src` and `libs/backend/persistence-sqlite/src` | `await`, `void`, `.then`/`.catch`/`.finally`, or a marker |
| `orphaned-suppression` | a `// degradation-audit:` marker that attaches to no catch, `.catch()` or floating-promise construct | moving the marker or deleting it |
| `bare-suppression` | a marker with no reason, an unknown kind or a broken separator | fixing the marker |

Points that change how you fix a site:

- **`logger.warn` / `.debug` / `.info` does not clear a `catch` block.** Only `.error(...)` or
  `throw` clears it. A `catch` that logs at warn or debug needs a `reported` marker as well.
  56 of the 198 catch sites already log at warn, debug or info. For most of them the fix is
  only the marker (Outcome D).
- Inside a `.catch(handler)`, a handler with two statements (log, then return) is no longer
  flagged. A marker is still good practice there, but the detector does not need one.
- The search stops at nested functions and at nested `catch` clauses. A `.error(...)` call
  inside a callback, or inside an inner `try/catch`, does not count for the outer catch.
- **Marker placement.** The marker must be in one of these places:
  1. the run of `//` lines that opens the catch body, directly after `catch (...) {`
     (preferred);
  2. the run of comment lines directly above the `catch` keyword line (rarely usable,
     because the line above `} catch` belongs to the `try` body);
  3. for `.catch()`, the comment run directly above the call line, or directly above the
     statement that contains it.

  A marker below the first code line of the catch body is orphaned.
- Format: `// degradation-audit: <optional-capability|reported> - <reason>`. The separator is
  `-`, `–` or `—`. The reason may continue on the next `//` lines.

### Forbidden detector dodges

- Calling `.error(...)` only to clear the detector when the event is not an error (Outcome A
  picks the level).
- Replacing `return null` with `const none = null; return none;`, or any similar rewrite that
  hides the literal.
- `void error;` with no log and no marker. Three sites do this now. Treat them as unlogged
  sites.
- A marker whose reason is false, or one that only says the code is "best effort" without
  saying what the caller gets.

## 2. Decision procedure per site

Take the first step that matches.

1. **Is it an orphaned marker?** → Outcome I.
2. **Is it a floating promise?** → Outcome H.
3. **Is it not a promise or exception at all?** An example is Zod
   `z.string().optional().catch(undefined)` (`libs/shared/src/lib/types/sdk-hook.schemas.ts:127`),
   where `.catch` is a schema fallback for one field. → Outcome C, with the reason
   "Zod schema fallback, not a promise".
4. **Does the handler forward the rejection?** An example is `.catch(reject)` inside a
   `new Promise` executor (`translation-proxy-base.ts:1150`). The failure propagates to the
   awaiting caller. → Outcome D, with a `reported` reason that names the outer promise.
   Do not rewrite it.
5. **Is the caught failure the designed answer?** Examples: `exists()` → `false` on access
   failure, a missing optional file → `null`, a probe for an optional host feature. → Outcome C.
   If the catch also hides other failures (for example `EACCES` or `EIO` behind
   `ENOENT`), split it as in Outcome C2.
6. **Is the failure already surfaced where a person or the caller sees it?** Examples: it is
   logged in this catch at warn or debug, it is set on a UI error signal or toast, it returns
   a result object that carries the error to a caller that logs it, or it is forwarded to
   Sentry. → Outcome D.
7. **Is the site inside an RPC handler or command, where the old code returns a sentinel that
   the renderer cannot tell from "no data"?** It stays a sentinel (rule zero). Log it
   (Outcome A) and list it under "behaviour change needed" if it should be an `RpcUserError`.
8. **Otherwise the failure is lost.** → Outcome A (log in place and keep the fallback). If the
   code has no logger, see Outcome E first. If it is a hot path or a pure utility, use
   Outcome F.

Rethrowing (Outcome B) is the right fix in only a few narrow cases; see that outcome.

## 3. Outcomes

### Outcome A: log and keep the fallback

Choose the level by what was lost.

| Level | When | Visible in production? |
|---|---|---|
| `error` | Lost data, a broken invariant, a user action that failed without telling the user, a failed write or persist, a feature that is off for the whole session | yes, and it clears the detector by itself |
| `warn` | A degraded result: an empty list instead of real data, a stale cache, a skipped optional step whose loss someone may notice | yes (prod min level is `info`) |
| `debug` | An expected, frequent or recoverable failure: a polling miss, a retry that will run again, a probe that often fails, a per-item skip in a large loop | **no**, prod drops debug (`PtahProdDefaults.LOG_LEVEL = 'info'`) |

Do not use `info` for a failure.

**Backend** (`Logger` from `@ptah-extension/vscode-core`, injected as `TOKENS.LOGGER`). Put a
`[Component]` tag in the message and the details in a structured object:

```ts
} catch (error: unknown) {
  this.logger.error('[TaskIndex] Could not persist the task index', {
    error: error instanceof Error ? error.message : String(error),
  });
  return false; // unchanged
}
```

`logger.error(message, err)` also accepts an `Error` as its second argument and records the
stack. Pass an `Error` only when the message cannot carry user content (see section 4):

```ts
const cause = error instanceof Error ? error : new Error(String(error));
this.logger.error('[CliDetection] Native Codex adapter factory failed', cause);
```

The same change at warn level needs the marker, because warn does not clear a catch:

```ts
} catch (error: unknown) {
  // degradation-audit: reported - logged at warn; callers get an empty
  // symbol list and the search panel shows no results.
  this.logger.warn('[CodeSymbolStore] BM25 search failed', {
    error: error instanceof Error ? error.message : String(error),
  });
  return [];
}
```

**Frontend** (`LoggingService` from `@ptah-extension/core`, signature
`warn(context, message, data?)`). Components and stores inject it as a field:

```ts
private readonly logger = inject(LoggingService);
// ...
} catch (error: unknown) {
  // degradation-audit: reported - logged at warn; the queue keeps the entry.
  this.logger.warn('FollowUpQueue', 'chat:queued-withdraw failed', {
    errorName: error instanceof Error ? error.name : typeof error,
  });
  return false;
}
```

**Sentry.** Call `sentryService.captureException(err, { errorSource: 'Class.method' })` only
in a class that already injects `TOKENS.SENTRY_SERVICE`. Do not add Sentry to a class in this
sweep. `RpcHandler` already reports thrown handler errors to Sentry and skips `RpcUserError`.

### Outcome B: rethrow or let it propagate

Rethrow only when **one** of these is true:

- The catch already rethrows on some branches, and the swallowed branch is a narrowing
  mistake that the existing code clearly meant to rethrow. Keep it as a sentinel and list it
  under "behaviour change needed". Do not fix it in this sweep.
- You are adding a log inside a catch that already ends with `throw`. That catch is not
  flagged, so leave it.
- New code that you write (none is expected in this sweep).

The general rule for later work, for reference only: let the error propagate when the caller
must act on it (persist, auth, a user command, an RPC handler whose renderer expects an
error), and in RPC handlers throw `RpcUserError(message, code)` for expected user conditions.
Because of rule zero, **this sweep never turns an existing `return <sentinel>` into a
`throw`.**

What is allowed is a guard that re-raises a typed error that the existing code already
rethrows elsewhere in the same catch. An example is `workspace-llm-resolver.ts`, which
rethrows `AuthRequiredError` and degrades on everything else.

### Outcome C: `optional-capability` (the fallback is the designed behaviour)

This marker is honest only when **all** of these are true:

1. The fallback value is the right answer for the failure, not a stand-in for it. Nothing
   that the user or the caller needs is lost.
2. The caller handles that value as a normal state (absent, unsupported, "not a match").
3. No other failure that matters can reach the same catch. If one can, split the catch (C2).

A good reason names **what the fallback means to the caller**, and when needed why no log is
written. A bad reason says only "best effort", "ignore" or "optional".

```ts
async exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    // degradation-audit: optional-capability - exists() answers "not
    // accessible" as false by contract; callers branch on it.
    return false;
  }
}
```

```ts
} catch {
  // degradation-audit: optional-capability - a cyclic value degrades to the
  // '[Unserializable]' placeholder so the log line is still written.
  return '[Unserializable]';
}
```

**C2: split "missing" from "broken".** The detector judges the catch as a whole, so keep the
marker and log the branch that is not the designed answer. The fallback is the same on both
branches:

```ts
} catch (error: unknown) {
  // degradation-audit: optional-capability - a missing artifact is a 404;
  // other read failures are logged at warn and also return null.
  if ((error as NodeJS.ErrnoException | null)?.code !== 'ENOENT') {
    this.logger.warn('[ArtifactStore] Artifact read failed', {
      code: (error as NodeJS.ErrnoException | null)?.code,
    });
  }
  return null;
}
```

Write the `code` check inline. Do not add an `isMissing` helper to a shared lib (lanes stay
file-disjoint). A helper that is local to the file is fine.

### Outcome D: `reported` (the failure is surfaced, and you say where)

This marker is honest only when the reason names **where** the failure becomes visible, and
that place exists in the code today:

- "logged at warn here" or "logged at debug here". Use debug only for expected or frequent
  failures (Outcome G), and say why debug is enough;
- "the caller logs it": name the caller (`Class.method`), and check that it really logs;
- "shown to the user": name the signal or toast (`this._error`, `connectError`,
  `worktreeNotice`);
- "returned to the caller as `{ ok: false, error }`" (a result object, not a bare sentinel);
- "forwarded to the outer promise's `reject`", or "rethrown by X".

```ts
} catch (error: unknown) {
  // degradation-audit: reported - shown to the user through _error with a
  // Retry action; the list keeps its previous rows.
  this._error.set(failureMessage('pin', error));
  return false;
}
```

```ts
// degradation-audit: reported - the rejection goes to the outer promise's
// reject, so the awaiting proxy request fails with it.
retryFn(true).then(resolve).catch(reject);
```

In a frontend catch that only sets a UI error, a debug log is optional. Add one
(`this.logger.debug(...)` with `errorName`) when the UI text is generic and hides the cause.

`reported` is **not** honest when the "surface" is a `return null` that the caller also
swallows. Check one level up before you write "the caller handles it".

### Outcome E: get a logger into code that has none

Use what the surrounding code already uses, in this order:

1. **Injectable class (tsyringe):** add a constructor parameter. Add it last and make it
   optional, so that existing `new X(...)` calls in specs and factories still compile.
   `TOKENS.LOGGER` is registered everywhere, so di-lint passes.
   ```ts
   constructor(
     @inject(TOKENS.WORKSPACE_PROVIDER) private readonly workspace: IWorkspaceProvider,
     @inject(TOKENS.LOGGER, { isOptional: true }) private readonly logger?: Logger,
   ) {}
   // ...
   this.logger?.warn('[X] ...', { error: message });
   ```
   If the class is constructed by hand (`new X(...)` in a `register.ts`), pass the logger the
   factory already has.
2. **Angular class:** `private readonly logger = inject(LoggingService);` from
   `@ptah-extension/core`. Exception: `libs/frontend/ui` (`type:ui`) and any lib that does not
   already import `@ptah-extension/core`. Do not add that import there (module boundaries).
   Use Outcome F, or `console.warn` / `console.error` with a `[Component]` tag, as
   `agent-session-adoption.service.ts` does.
3. **Plain function:** add a trailing optional `logger?: Pick<Logger, 'warn'>` (or `'debug'`).
   This follows `claude-builtin-catalog.ts:341` and `subagent-deliverables.ts:33`. Callers
   that have a logger pass it; the others keep working.
   ```ts
   export function readOptIn(path: string, logger?: Pick<Logger, 'warn'>): string[] {
     try { /* ... */ } catch (error: unknown) {
       // degradation-audit: reported - logged at warn when a logger is passed;
       // an empty list keeps every item off.
       logger?.warn('[ClaudeBuiltinCatalog] Could not read opt-in setting', {
         error: error instanceof Error ? error.message : String(error),
       });
       return [];
     }
   }
   ```
4. **`libs/shared` and `libs/backend/platform-core`** (`scope:shared`) must not import
   `vscode-core`. Declare a minimal structural interface in the same file, as
   `recursive-file-watcher.ts:47` (`WatcherLogger`) and `agent-budget-settings-migration.ts:8`
   do. Do not add it to a shared barrel.
5. **Code registered before the logger** (DI phase files, boot): resolve it lazily behind
   `container.isRegistered(TOKENS.LOGGER)`, as `wire-runtime.ts` and `degradation-reporter.ts`
   do. If there is none, use `console.warn`. The Electron main process already does this in
   `ipc-bridge.ts`.

**When NOT to add a logger:**

- pure utilities and parsers (`libs/shared` value helpers, schema parsing, formatting);
- hot paths: per-token stream transforms, per-row database mapping, per-keystroke UI work,
  render loops.

In these cases, return the failure to the caller and log there. Keep the public return type
when callers rely on it, and put the marker on the utility. If the utility's sentinel already
means "invalid input" to every caller, use `optional-capability` with that reason. If one
caller must tell the cause apart, list the site under "behaviour change needed". Do not
change the return type in this sweep.

### Outcome F: return the error to a caller that logs

Use this only where the function **already** returns a result object, for example
`{ written: false, error: message }` in `analysis-claude-md-linker.ts`. Fill the error field
and mark the site `reported - returned as { written: false, error }; <Caller> logs it`. Do not
add a result type to a function that returns a bare sentinel; that would change the
signature.

### Outcome G: avoid noise in loops, polling and retries

- A failure in a timer, a poll, a watcher, a per-file loop or a per-request path must not
  write one line each time.
- If the class already has a `RepeatedWarningLimiter` (`rpc-handler.ts`,
  `git-root-resolver.ts`), use it. To add one, make it a private field
  (`new RepeatedWarningLimiter()` from `@ptah-extension/vscode-core`). That is a class field,
  not a new shared helper:
  ```ts
  private readonly warnings = new RepeatedWarningLimiter();
  // ...
  } catch (error: unknown) {
    // degradation-audit: reported - logged at warn at most once a minute per
    // source (RepeatedWarningLimiter); the poll retries on the next tick.
    const suppressed = this.warnings.admit(`poll|${sourceId}`);
    if (suppressed !== null) {
      this.logger.warn('[UsagePoller] Poll failed', {
        error: error instanceof Error ? error.message : String(error),
        ...(suppressed > 0 ? { suppressedRepeats: suppressed } : {}),
      });
    }
    return null;
  }
  ```
  Keep the key a low-cardinality literal plus a stable id. Never put an error message or a
  path in the key.
- Otherwise use `debug` for the repeat, and log once at warn when a streak starts, if the
  class already tracks a streak. A per-item skip inside a loop that already logs a summary
  after the loop is `reported - counted in the <summary> line`.
- The frontend has no limiter. Use `debug` in polling and `effect()` code.

### Outcome H: floating promises

Await the call when the enclosing function is async and the caller can wait for it. Otherwise
mark it `void` and add a `.catch` that logs. Never leave it bare.

```ts
// apps/ptah-electron/src/ipc/ipc-bridge.ts:564: the IPC listener must not
// wait for fire-and-forget work.
void this.handleFireAndForgetMessage(messageType, msg).catch((error: unknown) => {
  console.error('[IpcBridge] Fire-and-forget message failed', {
    type: messageType,
    error: error instanceof Error ? error.message : String(error),
  });
});
```

Use the logger that the file already uses (`ipc-bridge.ts` uses `console`). Awaiting there
would change timing, so `void` plus `.catch` is the rule-zero choice. `.error(...)` in the
handler also keeps the new `.catch` from being flagged as a sentinel.

### Outcome I: orphaned suppressions

- If the catch is **still flagged** without the marker, move the marker to the first lines of
  the catch body, above any `if (...) throw`.
- If the catch is **no longer flagged** (it now throws on some path, calls `.error`, or does
  not return a literal), delete the `degradation-audit:` prefix. Keep the explanation as a
  plain comment when it still helps.

Known cases:

- `libs/backend/agent-sdk/src/lib/session-importer.service.ts:993`: the catch now starts with
  `if (named) throw` and has a `throw`, so it is not flagged. Drop the prefix and keep the
  prose. The warn log stays.
- `libs/backend/auth-providers/src/lib/auth/workspace-llm-resolver.ts:104`: the catch rethrows
  `AuthRequiredError` and returns no literal, so it is not flagged. Drop the prefix.

## 4. What may be logged

Allowed:

- error `name`, `code` (`ENOENT`, `EACCES`, HTTP status, `errorCode` of `RpcUserError`), a
  failure kind that you compute (`'timeout' | 'rejected'`);
- `error.message` for file-system, database, DI and network errors raised by our own code or
  by Node;
- ids that the codebase already logs: session id, tab id, task id, method name, correlation
  id, provider id, key **names** (never values);
- file paths only where the same file or class already logs paths (for example
  `session-importer` logs `filePath`). Do not add path logging to a new area. Prefer the
  `code`.

Never logged:

- secrets, tokens, API keys, cookies, auth headers, OAuth payloads, credential-file content.
  Log only presence, length or category (`copilot-auth.service.ts`, `kimi-code-credential-store.ts`);
- prompts, chat or message content, transcripts, tool input and output, file contents,
  clipboard text, memory text;
- provider or control-request error text that can echo account data. Log the failure kind
  only, as `session-quota-probe.service.ts:473` and `sdk-model-service.ts:529` do;
- an `Error` object (which carries its message and stack) when its message can contain the
  items above. Pass `{ errorName: error.name }` instead.

If you are not sure that a message is safe, log `errorName` / `code` only. Follow the
existing comments in a file that says "never log X".

## 5. Lane rules

- Edit only the files in your lane's site list (`.ptah/tmp/degradation-sites.json`). Do not
  touch `tools/degradation-audit/baseline.json`; the coordinator lowers it.
- Check your files: `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts
  --changed-files <file> [<file> ...]` (repo-relative paths). It must report no violation in
  them. Also run the focused checks from `CLAUDE.md`:
  `npx jest --config <project>/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs>`,
  `npx tsc --noEmit --project <tsconfig>` and `npx eslint <changed files>`. CLI lanes do not
  run `npm run verify` or `nx`.
- If a spec asserts that a call has "no log", or counts logger calls, update the expectation
  and nothing else. A spec that fails because the behaviour changed means you broke rule zero.
- Do not commit or push. Report one row per site: `file:line - outcome (A..I) - level or
  marker kind`. Add a separate **"behaviour change needed"** list for the sites that you
  annotated but think should rethrow or return a richer result.
