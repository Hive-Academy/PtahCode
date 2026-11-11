# Lane report: button adoption 4b (chat-ui, harness-builder, command-center)

## Converted

| file:line | old classes | new attributes | notes |
|---|---|---|---|
| `atoms/expandable-content.component.ts:29` | `btn btn-xs btn-ghost gap-1 h-4 min-h-4 px-1` | `ptahButton variant="ghost" size="xs"` |  |
| `atoms/theme-toggle.component.ts:204` | `btn btn-ghost btn-xs gap-1` | `ptahButton variant="ghost" size="xs"` |  |
| `molecules/background-agent-strip.component.ts:308` | `btn btn-ghost btn-xs btn-square w-6 h-6 min-h-0 text-base-content-muted hover:text-base-content focus-visible:outline-none focus-visible:rin` | `ptahIconButton size="xs"` | icon-only; label from aria-label; title removed |
| `molecules/compact-session/compact-session-activity.component.ts:568` | `btn btn-primary btn-xs w-full` | `ptahButton variant="primary" size="xs" class="w-full"` |  |
| `molecules/lane-result/lane-result-card.component.ts:130` | `btn btn-ghost btn-square btn-xs h-7 w-7 min-h-0 flex-shrink-0 text-info/80 hover:text-info` | `ptahIconButton size="xs" class="flex-shrink-0"` | icon-only; label 'Open <name>'; title(path) removed; text-info ink dropped; spec updated |
| `molecules/notifications/compaction-marker.component.ts:45` | `btn btn-ghost btn-xs h-4 min-h-4 px-1 text-primary` | `ptahButton variant="ghost" size="xs"` |  |
| `molecules/notifications/compaction-marker.component.ts:69` | `btn btn-sm btn-circle btn-ghost` | `ptahIconButton label="Close compaction summary"` | icon-only; label from aria-label |
| `molecules/permissions/permission-request-card.component.ts:132` | `btn btn-xs btn-error btn-outline gap-0.5 px-2` | `ptahButton variant="danger" size="xs"` |  |
| `molecules/question-card.component.ts:235` | `btn btn-xs btn-ghost gap-0.5 px-1.5` | `ptahButton variant="ghost" size="xs"` |  |
| `molecules/session/session-stats-summary.component.html:241` | `btn btn-ghost btn-xs btn-square text-base-content-muted hover:text-base-content` | `ptahIconButton size="xs" label="Collapse stats"` | icon-only; aria-label+title -> label |
| `molecules/setup-plugins/mcp-directory-browser.component.ts:149` | `btn btn-ghost btn-xs` | `ptahButton variant="ghost" size="xs"` |  |
| `molecules/setup-plugins/mcp-directory-browser.component.ts:254` | `btn btn-primary btn-sm` | `ptahButton variant="primary"` |  |
| `molecules/setup-plugins/mcp-directory-browser.component.ts:439` | `btn btn-primary btn-sm` | `ptahButton variant="primary"` |  |
| `molecules/setup-plugins/plugin-catalog-panel.component.ts:438` | `btn btn-sm btn-ghost` | `ptahButton variant="ghost"` |  |
| `molecules/setup-plugins/plugin-catalog-panel.component.ts:501` | `btn btn-ghost btn-xs gap-1` | `ptahButton variant="ghost" size="xs"` |  |
| `molecules/setup-plugins/plugin-catalog-panel.component.ts:620` | `btn btn-primary btn-sm` | `ptahButton variant="primary"` |  |
| `molecules/setup-plugins/skill-sh-browser.component.ts:288` | `btn btn-primary btn-sm` | `ptahButton variant="primary"` |  |
| `molecules/setup-plugins/skill-sh-browser.component.ts:323` | `btn btn-primary btn-sm` | `ptahButton variant="primary"` |  |
| `molecules/tool-execution/code-output.component.ts:101` | `btn btn-ghost btn-xs h-7 min-h-0 px-2 text-[11px] font-normal shrink-0` | `ptahButton variant="ghost" size="xs" class="shrink-0"` |  |
| `molecules/tool-execution/file-change-diff.component.ts:49` | `btn btn-ghost btn-xs m-2` | `<button type="button" ptahButton variant="ghost" size="xs" class="m-2" (click)="expand($index)">Show all</button>` |  |
| `molecules/tool-execution/tool-call-header.component.ts:228` | `btn btn-ghost btn-square btn-xs h-7 w-7 min-h-0 flex-shrink-0 text-info/80 hover:text-info` | `ptahIconButton size="xs" class="flex-shrink-0"` | icon-only; label 'Open <name>'; title(path) removed; text-info ink dropped; spec updated |
| `molecules/tool-execution/tool-input-display.component.ts:126` | `btn btn-ghost btn-xs h-7 min-h-0 px-2 text-[11px] font-normal` | `ptahButton variant="ghost" size="xs"` |  |
| `molecules/turn-recap/turn-summary-files.component.ts:155` | `btn btn-xs btn-ghost` | `ptahButton variant="ghost" size="xs"` |  |
| `molecules/turn-recap/turn-summary-files.component.ts:201` | `btn btn-xs btn-ghost` | `ptahButton variant="ghost" size="xs"` |  |
| `organisms/artifacts/artifact-card.component.ts:59` | `btn btn-primary btn-xs gap-1` | `ptahButton variant="primary" size="xs"` |  |
| `organisms/artifacts/artifact-card.component.ts:70` | `btn btn-ghost btn-xs gap-1` | `ptahButton variant="ghost" size="xs"` |  |
| `organisms/artifacts/artifact-viewer.component.ts:126` | `btn btn-ghost btn-xs` | `@if (!srcInvalid()) { <button type="button" ptahButton variant="ghost" size="xs" (click)="retry()">Retry</button> }` |  |
| `organisms/artifacts/artifact-viewer.component.ts:154` | `btn btn-ghost btn-xs gap-1` | `ptahButton variant="ghost" size="xs"` |  |
| `organisms/display-panel/display-file-viewer.component.ts:19` | `btn btn-ghost btn-xs` | `<button type="button" ptahButton variant="ghost" size="xs" (click)="retry()">Retry</button>` |  |
| `organisms/display-panel/display-panel.component.ts:175` | `btn btn-ghost btn-xs` | `ptahButton variant="ghost" size="xs"` |  |
| `organisms/mermaid/mermaid-diagram.component.ts:35` | `btn btn-ghost btn-xs` | `<button type="button" ptahButton variant="ghost" size="xs" (click)="copy()" aria-label="Copy Mermaid source"><lucide-angular [img]="CopyIcon" class="h-3.5 w-3.5` |  |
| `command-center-header.component.ts:22` | `btn btn-ghost btn-sm underline` | `<button type="button" ptahButton variant="ghost" class="underline" (click)="voiceSettings.emit()">Open Voice settings</button>` |  |
| `command-center-header.component.ts:24` | `btn btn-ghost btn-sm max-w-full gap-1 border border-base-300 bg-base-200 font-mono text-xs` | `<button type="button" ptahButton class="max-w-full" [attr.aria-label]="voiceAriaStatus()" [title]="voiceAriaStatus()" (click)="voiceSettings.emit()">` |  |
| `command-center-header.component.ts:37` | `btn btn-ghost btn-sm border border-base-300` | `btn btn-ghost btn-sm border border-base-300 / <button type="button" ptahButton (click)="voiceSettings.emit()"><lucide-angular [img]="settingsIcon" class="mr-1 s` | ghost+border -> secondary; icon-only; dynamic label |
| `command-center-page.component.html:38` | `btn btn-sm text-base-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content` | `ptahButton` |  |
| `command-center-page.component.html:46` | `btn btn-ghost btn-sm text-base-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ba` | `ptahIconButton label="Dismiss notification"` | x glyph kept as child; label from aria-label; focus-visible utilities dropped |
| `command-center-start.component.ts:53` | `btn btn-primary min-h-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2` | `ptahButton variant="primary" size="md"` |  |
| `command-center-start.component.ts:64` | `btn btn-outline min-h-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2` | `ptahButton size="md"` |  |
| `command-center-start.component.ts:83` | `btn btn-outline min-h-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2` | `ptahButton size="md"` |  |
| `command-pending-input.component.ts:63` | `btn btn-outline min-h-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content` | `ptahButton size="md"` |  |
| `command-pending-input.component.ts:116` | `btn btn-outline min-h-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content` | `ptahButton size="md"` |  |
| `command-rail-display.component.ts:73` | `btn btn-ghost btn-xs` | `<button type="button" ptahButton variant="ghost" size="xs" (click)="toggleWindow()">` |  |
| `command-rail-display.component.ts:120` | `btn btn-ghost btn-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content` | `ptahButton variant="ghost" size="xs"` |  |
| `command-session-controls.component.ts:14` | `btn btn-ghost btn-sm min-h-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-conten` | `<button type="button" ptahButton variant="ghost" size="md"` |  |
| `command-session-controls.component.ts:16` | `<button type="button" class="session-new btn btn-ghost btn-sm min-h-10 focus-visible:outline focus-v` | `<button type="button" class="session-new" ptahButton variant="ghost" size="md"` |  |
| `command-session-controls.component.ts:27` | `btn btn-ghost btn-sm min-h-10 min-w-10 disabled:border-base-300 disabled:text-base-content-muted focus-visible:outline focus-visible:outline` | `<button type="submit" ptahIconButton label="Send command" size="md"` | icon-only submit; type=submit kept; label from aria-label |
| `command-voice-hud.component.ts:54` | `btn btn-sm btn-outline min-h-10 disabled:border-base-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-` | `<button type="button" ptahButton size="md"` |  |
| `command-voice-hud.component.ts:56` | `btn btn-sm btn-outline min-h-10 disabled:border-base-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-` | `<button type="button" ptahButton size="md"` |  |
| `command-voice-hud.component.ts:59` | `btn btn-ghost btn-sm min-h-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-conten` | `<button type="button" ptahButton variant="ghost" size="md"` |  |
| `command-voice-hud.component.ts:67` | `btn btn-ghost btn-sm min-h-10 text-base-content underline` | `<button type="button" ptahButton variant="ghost" size="md" class="underline" (click)="openVoiceSettings.emit()">Open Voice settings</button>` |  |
| `command-voice-hud.component.ts:69` | `btn btn-ghost btn-sm min-h-10 border border-base-content text-base-content underline` | `<button type="button" ptahButton size="md" class="underline" (click)="start.emit()">Retry microphone</button>` |  |
| `command-voice-hud.component.ts:75` | `btn btn-ghost btn-sm min-h-10 text-base-content underline` | `<button type="button" ptahButton variant="ghost" size="md" class="underline" (click)="openVoiceSettings.emit()">Open Voice settings</button>` |  |
| `harness-builder-leave-dialog.component.ts:88` | `btn btn-outline btn-sm` | `ptahButton` |  |
| `harness-builder-leave-dialog.component.ts:95` | `btn btn-primary btn-sm` | `ptahButton variant="primary"` |  |
| `harness-builder-leave-dialog.component.ts:109` | `btn btn-outline btn-sm border-base-content/50 min-h-10 min-[460px]:min-h-8` | `ptahButton` |  |
| `harness-builder-leave-dialog.component.ts:117` | `btn btn-outline btn-sm border-base-content/50 min-h-10 min-[460px]:min-h-8` | `ptahButton` |  |
| `harness-builder-leave-dialog.component.ts:125` | `btn btn-primary btn-sm min-h-10 min-[460px]:min-h-8` | `ptahButton variant="primary"` |  |
| `harness-config-preview.component.ts:58` | `btn btn-outline btn-xs mt-2` | `ptahButton size="xs" class="mt-2"` |  |
| `harness-config-preview.component.ts:78` | `btn btn-outline btn-xs mt-2` | `ptahButton size="xs" class="mt-2"` |  |
| `harness-config-preview.component.ts:262` | `btn btn-outline btn-xs mt-2` | `ptahButton size="xs" class="mt-2"` |  |
| `sidebar/builder-ai-helpers-section.component.ts:52` | `btn btn-ghost btn-sm mt-3` | `ptahButton variant="ghost" class="mt-3"` |  |
| `sidebar/builder-ai-helpers-section.component.ts:117` | `btn btn-outline btn-sm border-base-content/50` | `ptahButton` |  |
| `sidebar/builder-ai-helpers-section.component.ts:123` | `btn btn-ghost btn-sm` | `ptahButton variant="ghost"` |  |
| `sidebar/builder-ai-helpers-section.component.ts:151` | `btn btn-ghost btn-xs min-h-6` | `ptahButton variant="ghost" size="xs"` |  |
| `sidebar/builder-ai-helpers-section.component.ts:167` | `btn btn-outline btn-xs border-base-content/50` | `ptahButton size="xs"` |  |
| `sidebar/builder-ai-helpers-section.component.ts:180` | `btn btn-ghost btn-xs` | `ptahButton variant="ghost" size="xs"` |  |
| `sidebar/builder-ai-helpers-section.component.ts:196` | `btn btn-outline btn-xs border-base-content/50` | `ptahButton size="xs"` |  |
| `sidebar/builder-ai-helpers-section.component.ts:203` | `btn btn-ghost btn-xs` | `ptahButton variant="ghost" size="xs"` |  |
| `sidebar/builder-apply-section.component.ts:83` | `btn btn-ghost btn-xs min-h-6 mt-1` | `ptahButton variant="ghost" size="xs" class="mt-1"` |  |
| `sidebar/builder-apply-section.component.ts:94` | `btn btn-ghost btn-xs min-h-6` | `ptahButton variant="ghost" size="xs"` |  |
| `sidebar/builder-apply-section.component.ts:125` | `btn btn-ghost btn-xs min-h-6` | `ptahButton variant="ghost" size="xs"` |  |
| `sidebar/builder-apply-section.component.ts:137` | `btn btn-ghost btn-xs min-h-6 mt-2` | `ptahButton variant="ghost" size="xs" class="mt-2"` |  |
| `sidebar/builder-apply-section.component.ts:155` | `btn btn-primary btn-sm w-full mt-2` | `ptahButton variant="primary" class="w-full mt-2"` |  |
| `sidebar/builder-presets-section.component.ts:56` | `btn btn-outline btn-sm mt-2 border-base-content/50` | `ptahButton class="mt-2"` |  |
| `sidebar/builder-presets-section.component.ts:81` | `btn btn-outline btn-xs border-base-content/50` | `ptahButton size="xs"` |  |
| `sidebar/builder-presets-section.component.ts:90` | `btn btn-ghost btn-sm mt-2` | `ptahButton variant="ghost" class="mt-2"` |  |
| `sidebar/builder-presets-section.component.ts:134` | `btn btn-outline btn-sm border-base-content/50` | `ptahButton` |  |
| `sidebar/builder-stack-profile-section.component.ts:82` | `btn btn-ghost btn-xs min-h-6` | `ptahButton variant="ghost" size="xs"` |  |

Notes on the table:
- Rows whose "old classes" column shows raw markup are single-line buttons. Their full new markup is in the "new attributes" column.
- `command-center-header.component.ts:24` and `:37` map ghost + border classes to secondary (no `variant`).
- `size="md"` replaces `min-h-10` / `min-h-11` in command-center. `focus-visible:outline*` utilities were dropped because the family owns the focus ring.
- Each converted component imports exactly the directive(s) it uses from `@ptah-extension/ui`.
- Spec changes: `lane-result-card.component.spec.ts` and `tool-call-header.component.spec.ts` read the removed `title` attribute. They now check `data-ptah-button`.

## Skipped

| file:line | reason |
|---|---|
| chat-ui atoms/copy-button.component.ts:30 | dynamic `[class]` builds the btn classes |
| chat-ui atoms/report-response-button.component.ts:36 | dynamic `[class]` builds the btn classes (anchor) |
| chat-ui atoms/copy-text-button.component.ts:36 | spec needs a tooltip title different from aria-label (state text); the directive cannot keep both |
| chat-ui molecules/agent-card/agent-card-permission.component.ts:47 | `btn-success` (no family variant) |
| chat-ui molecules/agent-card/agent-card-permission.component.ts:55 | destructive button on a warning-tinted panel (`bg-warning/5`) |
| chat-ui molecules/agent-steer-input.component.ts:95 | used inside the chat composer card (composer variant); not touched |
| chat-ui molecules/chat-input/autopilot-popover.component.ts:140,172 | chat composer area; not touched |
| chat-ui molecules/compact-session/compact-session-callout.component.ts:45,71,91,99 | buttons on warning/error tinted panels (`bg-warning/10`, `bg-error/10`) |
| chat-ui molecules/lane-composer.component.ts:36,52,58,59,68 | chat composer; also `btn-warning` at :58 and a spec reads `.btn-warning` |
| chat-ui molecules/permissions/deny-message-popover.component.ts:51,75 | `btn-warning` |
| chat-ui molecules/permissions/permission-request-card.component.ts:110,121 | `btn-success`, `btn-info` |
| chat-ui molecules/question-card.component.ts:214,255,265 | `btn-info` |
| chat-ui molecules/setup-plugins/install-scope-field.component.ts:99 | `join-item` with dynamic `[class.btn-primary]` |
| chat-ui molecules/setup-plugins/mcp-directory-browser.component.ts:164 | Dismiss button on `alert-error` panel |
| chat-ui molecules/setup-plugins/plugin-catalog-panel.component.ts:317,328 | `join-item` with `[ngClass]` |
| chat-ui molecules/setup-plugins/skill-sh-browser.component.ts:164 | Dismiss button on `alert-error` panel |
| chat-ui molecules/setup-plugins/skill-sh-browser.component.ts:274 | red ghost (`btn-ghost text-error`) |
| chat-ui molecules/turn-recap/turn-summary-files.component.ts:129,146 | `rounded-full` pill buttons |
| chat-ui organisms/mermaid/mermaid-diagram.component.ts:32,33 | `join-item` with `btn-active` toggles |
| chat-ui organisms/ptah-ui/ptah-ui-display-chip.component.ts:49 | `rounded-full` chip |
| harness-builder sidebar/builder-apply-section.component.ts:51 | button on error-tinted panel (`bg-error/10`) |
| harness-builder sidebar/builder-apply-section.component.ts:258-259 | `[class]="applyButtonClass()"` dynamic class (computed btn classes) |
| command-center command-pending-input.component.ts:97,129 | `btn-warning` |

## Counts

- Converted: 78 buttons.
- Skipped: about 41 buttons (see the Skipped table).
- Specs changed: 3 (`lane-result-card`, `tool-call-header`, `command-voice-hud`).
  They now check `data-ptah-button` or the directive classes instead of removed classes or `title`.

## Test results

- `chat-ui`: pass.
- `harness-builder`: pass.
- `command-center`: pass after the `command-voice-hud` spec update.
- `typecheck-templates` did not run.
