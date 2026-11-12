# T1 API contract (both lanes code against this, exactly)

## ui: `libs/frontend/ui/src/lib/time/` (new folder, exported from `@ptah-extension/ui`)

```ts
// clock.token.ts
export interface PtahClock {
  /** Epoch ms. Updates once per second while at least one holder exists and the window is visible. */
  readonly now: Signal<number>;
  /** Hold the clock. Call the result once to release (later calls do nothing). */
  acquire(): () => void;
}
export const PTAH_CLOCK = new InjectionToken<PtahClock>('PTAH_CLOCK');
// No default factory. The app provides { provide: PTAH_CLOCK, useExisting: ClockService }.
// Component specs provide a fake clock.

/** Holds the clock for the injection context lifetime, or only while active() is true. */
export function injectPtahClock(active?: () => boolean): Signal<number>;

// time-input.ts
export type PtahTimeInput = number | Date | string; // epoch ms, Date, or ISO string
export function toEpochMs(value: PtahTimeInput): number; // NaN for invalid

// format-duration.ts
export type DurationStyle = 'clock' | 'compact';
/** 'clock': "0:05", "12:34", "1:02:03" (h:mm:ss, m:ss below 1 h). 'compact': "45s", "5m 3s", "1h 2m", "2d 3h". Negative -> 0. NaN -> "--". Default 'compact'. */
export function formatDuration(ms: number, style?: DurationStyle): string;

// format-relative.ts
/** "just now" (|d| < 10 s), "45s ago", "5m ago", "3h ago", "2d ago", "in 5m", ... Uses largest unit, one unit only. Invalid -> "". */
export function formatRelative(at: PtahTimeInput, now: number): string;
/** Absolute text for title: new Date(ms).toLocaleString(). Invalid -> "". */
export function formatAbsolute(at: PtahTimeInput): string;
```

### `<ptah-timer>` (`PtahTimerComponent`, timer.component.ts)

- Inputs: `startedAt: PtahTimeInput` (required), `endedAt: PtahTimeInput | null` (default null, freezes), `format: DurationStyle` (default 'clock'), `label: string` (default 'Elapsed time').
- Holds the clock only while not frozen. Value = (endedAt ?? now) - startedAt, derived from the timestamp, never from a tick count.
- Host: `role="timer"`, `aria-live="off"`, `aria-label` = label, `[attr.data-state]` = 'running' | 'frozen'.
- Template: `<time [attr.datetime]="ISO duration PT..S" [title]="'Started ' + absolute">value</time>` and a polite live region span (visually hidden) with text "Stopped" when frozen, else empty.

### `<ptah-countdown>` (`PtahCountdownComponent`, countdown.component.ts)

- Inputs: `deadline: PtahTimeInput` (required), `urgentBelowMs: number` (default 60_000), `format: DurationStyle` (default 'clock'), `label: string` (default 'Time left').
- Output: `expired: void`. Fires once per deadline value, also when the expiry happened while the window was hidden (the clock recomputes now on return). Does not fire when the deadline is already past at first render? -> It DOES fire once (consumers need the signal); document this.
- Holds the clock only while not expired.
- Host: `role="timer"`, `aria-live="off"`, `aria-label`, `[attr.data-state]` = 'running' | 'urgent' | 'expired'.
- Template: `<time [attr.datetime]="deadline ISO" [title]="'Ends ' + absolute">value</time>`, polite live region: '' running, "Less than {formatDuration(urgentBelowMs,'compact')} left" urgent, "Expired" expired. The text changes only on state change.
- Tone: urgent and expired change color with `--ptah-*` tokens only. No animation. A color transition is off under `prefers-reduced-motion: reduce`. No ring in T1.

### `<ptah-relative-time>` (`PtahRelativeTimeComponent`, relative-time.component.ts)

- Inputs: `value: PtahTimeInput` (required).
- Renders `<time [attr.datetime]="ISO" [title]="absolute">formatRelative(value, now)</time>`. No live region, no role timer (static text).
- Refresh: uses the shared 1 s clock but the displayed text is a computed, so the DOM changes only when the text changes (1 s below 1 min, then 1 min, then 1 h granularity follows from the format).

## core: `libs/frontend/core/src/lib/services/clock.service.ts`

```ts
@Injectable({ providedIn: 'root' })
export class ClockService { // structurally satisfies PtahClock; does NOT import ui
  readonly now: Signal<number>;
  acquire(): () => void;
}
export function injectClock(active?: () => boolean): Signal<number>;
```

- One `setInterval` of 1000 ms, outside the Angular zone, only while holders > 0 and `!document.hidden`.
- `visibilitychange` listener only while holders > 0. Hidden -> clear the interval. Visible -> set now = Date.now() at once, then restart.
- Each acquire sets now = Date.now().
- `WallClockService` keeps `now(cadence)`, `acquire(cadence)`, `injectWallClock`, `WallClockCadence`, `WALL_CLOCK_COARSE_MS`. 'second' = ClockService.now. 'coarse' = a computed that changes at most every 30 s. Both acquire through ClockService.
- `CountdownClock` (machines-ui) keeps `now` and `acquire()`, delegates to ClockService.
- App: `apps/ptah-extension-webview` root providers add `{ provide: PTAH_CLOCK, useExisting: ClockService }`.
