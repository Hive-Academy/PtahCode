# PR #982 CodeRabbit round 1 (head 7f8012fc7)

## 4504955861 — libs/backend/remote-machines/src/lib/machine-connection.ts:488

**Prevent failed replays from triggering repeated replays.**

If a replay for a log view fails while the machine is connected, `attach()` emits `session-reattach-failed`. The renderer then forces another replay. Repeated worker refusals can cause continuous RPCs and replays for the machine’s other log views.

Stop this feedback loop while retaining reconnect recovery and per-call error handling.

## 4504955866 — libs/frontend/machines-ui/src/lib/components/readiness-panel/readiness-panel.component.ts:258

** Minor** · **Functional Correctness** · **Quick win**

**Re-run the readiness check only when `machineId` changes.**

The effect reads `this.machine().machineId`, so it tracks the `machine` input signal itself. `MachinesStore.onState` and `machineCall` replace the machine object on every push or RPC result, including pushes where the machine stays the same. Each replacement re-runs the effect, which sends a new `machines:readiness` call. Each call also shows the loading state again. Track a computed `machineId` that only changes when the string changes.

🐛 Proposed fix

```diff
--- "a/libs/frontend/machines-ui/src/lib/components/readiness-panel/readiness-panel.component.ts"
+++ "b/libs/frontend/machines-ui/src/lib/components/readiness-panel/readiness-panel.component.ts"
@@ -251,11 +251,13 @@
     };
   });

+  private readonly machineId = computed(() => this.machine().machineId);
+
   public constructor() {
     effect(() => {
-      const machineId = this.machine().machineId;
+      const machineId = this.machineId();
       untracked(() => void this.run(machineId));
     });
     inject(DestroyRef).onDestroy(() => {
       this.destroyed = true;
       clearTimeout(this.copiedTimer);
```

## 4504955867 — libs/frontend/machines-ui/src/lib/components/remote-session-list/remote-session-list.component.ts:300

** Minor** · **Functional Correctness** · **Quick win**

**Track `machineId` as a value, not the `machine` object.**

The effect reads `this.machine().machineId`, so it depends on the `machine` input signal. `MachinesStore.onState` builds a new `RemoteMachine` object for every `machines:state` push of that machine, even when the push only changes `lastSeenAt`, `nextRetryAt` or `versions`. `machineCall` (Retry, Pair) does the same.

Each new object re-runs the effect, which causes two problems:
- `composing.set(false)` closes the New session form, so the user loses the typed prompt.
- When the machine is connected, `load()` sends `machines:workspaces` plus one `machines:sessions` call per workspace.

Use a computed `machineId` that only changes when the string changes.

🐛 Proposed fix

```diff
--- "a/libs/frontend/machines-ui/src/lib/components/remote-session-list/remote-session-list.component.ts"
+++ "b/libs/frontend/machines-ui/src/lib/components/remote-session-list/remote-session-list.component.ts"
@@ -289,10 +289,12 @@
   /** Reloads exclude each other; a newer one wins. */
   private loadToken = 0;

+  private readonly machineId = computed(() => this.machine().machineId);
+
   public constructor() {
     effect(() => {
-      const machineId = this.machine().machineId;
+      const machineId = this.machineId();
       const connected = this.connected();
       untracked(() => {
         this.composing.set(false);
         if (connected) void this.load(machineId);
```

## 4504955868 — libs/frontend/machines-ui/src/lib/services/machines-store.ts:485

** Minor** · **Functional Correctness** · **Quick win**

**Re-attach detached sessions when the machine reconnects.**

A user can open a session while the machine is offline. The attach then fails, and `settleAttach` dispatches `attach-failed`, so the reducer mode becomes `detached`. When the machine reconnects, `onState` dispatches `{ kind: 'connected' }`. `reduceSessionEvent` ignores that action unless the mode is `log` (Line 160 in `session-event-reducer.ts`).

The view therefore stays `detached` after the reconnect, with these effects:
- `refusal()` returns `'not-open'`.
- `RemoteComposerComponent.canSend` stays false.
- The composer shows no reason line, because `connected()` is now true.
- The Refresh button is not available, because `RemoteSessionViewComponent` shows it only for `watchOnly`.

The only recovery is to go back and open the session again. Start a new attach for detached entries on reconnect.

🐛 Proposed fix

```diff
--- "a/libs/frontend/machines-ui/src/lib/services/machines-store.ts"
+++ "b/libs/frontend/machines-ui/src/lib/services/machines-store.ts"
@@ -479,10 +479,14 @@
     if (push.state !== 'connected') return;
     const reattachFailed = push.reason === 'session-reattach-failed';
     if (previous.state === 'connected' && !reattachFailed) return;
     for (const [key, entry] of this._views()) {
       if (entry.machineId !== push.machineId) continue;
+      if (entry.reducer.mode === 'detached') {
+        void this.openSession(entry.machineId, entry.reducer.sessionId);
+        continue;
+      }
       this.dispatch(key, { kind: 'connected', force: reattachFailed });
     }
   }

   private onEvent(event: MachinesEventPayload): void {
```

Committable suggestion

>  **IMPORTANT**
> Review the replacement and indentation, then test before committing.

```suggestion
    for (const [key, entry] of this._views()) {
      if (entry.machineId !== push.machineId) continue;
      if (entry.reducer.mode === 'detached') {
        void this.openSession(entry.machineId, entry.reducer.sessionId);
        continue;
      }
      this.dispatch(key, { kind: 'connected', force: reattachFailed });
    }
```

## 4504955888 — libs/frontend/machines-ui/src/lib/utils/remote-markdown.ts:22

**Match closing fences to the renderer**

A line such as ` ```x ` closes the sanitizer’s fence but not marked’s fence. If a tilde fence follows, an image after the actual closing fence can remain unescaped and load a worker-chosen URL.

Align the closing check with marked’s behavior. A whitespace-only check is not sufficient because marked also accepts mixed marker suffixes.

 Tools

OpenGrep (1.31.0)

[ERROR] 17-17: A nonliteral argument is passed to exec/execSync. Identify the receiver: Node child_process methods execute shell commands, while regular-expression and database methods have different contracts. For shell execution, prefer execFile or spawn with an argument array.

(coderabbit.command-injection.exec-js)

## 4504955890 — libs/frontend/machines-ui/src/lib/utils/remote-markdown.ts:26

**Reject backticks in a backtick fence’s info string.**

`remoteMarkdown` treats `` ```x` `` as a fence opener, but `marked` treats it as text. A later image then bypasses escaping and can load a worker-chosen HTTPS URL.

🔒 Proposed fix

```diff
--- "a/libs/frontend/machines-ui/src/lib/utils/remote-markdown.ts"
+++ "b/libs/frontend/machines-ui/src/lib/utils/remote-markdown.ts"
@@ -20,10 +20,10 @@
         fence = null;
       continue;
     }
-    if (match) {
+    if (match && isFenceOpener(line, match)) {
       fence = match[1];
       continue;
     }
     lines[index] = escapeOutsideCodeSpans(line);
   }
   return lines.join('\n');
```

```ts
/** CommonMark: a backtick fence's info string may not contain a backtick. */
function isFenceOpener(line: string, match: RegExpExecArray): boolean {
  if (match[1][0] !== '`') return true;
  return !line.slice(match.index + match[0].length).includes('`');
}
```

