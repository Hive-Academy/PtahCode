# AI team builder: skill UI plan

## Existing flow and proposed placement

Today `/onboarding/team-builder` renders `TeamBuilderStartPage`: workspace header, intent textarea, attachments, and **Start team builder**. Submit calls `HarnessChatLauncherService.launchTeamBuilder()`, which obtains `harness:workflow-prompt` through `ClaudeRpcService` and opens a `harness-configure` chat tab. There is no team-builder wizard or skill step yet. The `/onboarding/analyze/*` route sequence is a separate agent-generation flow and should not be copied into this path.

Keep the existing route and page as the owner of a small in-page progression:

```text
Intent + attachments (existing)
  -> Skills and project guidance (one review stage)
       -> recommended skills, search, selection, guidance facts
  -> Review install and consent (only if skills selected)
       -> inspect script-bearing skills and explicitly approve each current hash
  -> host installs selected skills -> existing chat launch
```

The user can go Back from review to edit intent without losing attachments or selections. **Skip skills** launches the current chat flow; empty recommendations and unavailable optional guidance must not trap the user. The page retains its workspace requirement and aborts/ignores late requests when destroyed or when the workspace changes. Show install failures and any partially installed skill names before retry; do not silently relaunch chat. Keep the review stage in the team-builder route rather than introducing three new wizard routes/components.

## Component structure

| Piece | Responsibility | Reuse / new |
| --- | --- | --- |
| `TeamBuilderStartPage` | Container and stage state (`intent`, `review`, `consent`, `installing`, `launching`), request orchestration, validation, navigation, attachment lifetime. Inject `ClaudeRpcService` for skill RPC and retain `HarnessChatLauncherService` for chat launch. | Extend existing page. |
| `TeamBuilderSkillReviewComponent` (under `proposal/`) | Present recommended/search results, selection and guidance facts. Inputs: recommendations, guidance, selected IDs, loading/error state; outputs: toggle, search, continue, skip/back. No RPC or service injection. | One new feature-specific component if page template becomes unwieldy; otherwise keep these sections in the page initially. |
| Consent review | A section or `NativeModalComponent` opened by the page after host supplies script and hash details. Show source, skill name, script disclosure and exact current-content identity; require an explicit approval action per skill, with Cancel/Back. No blanket prechecked consent. | Reuse `NativeModalComponent`; extract `TeamBuilderSkillConsentComponent` only if the template needs isolation. |
| Guidance | Read-only facts grouped by `category`, with `follow` / `tolerate` / `do_not_copy` labels and evidence. It is context for selection, not a separate wizard. | Inline in skill review; no new guidance page. |

`libs/frontend/ui` already exports `PtahButtonDirective`, `PtahCheckboxDirective`, `PtahFieldComponent`, `PtahInputDirective`, `PtahStatePanelComponent`, `NativeCardComponent`, `NativeModalComponent`, and `CatalogCardComponent`/`CatalogCardSkeletonComponent`. Use buttons and labelled checkboxes for selection, a field/input for search, state panel for loading/empty/error, cards for recommendation evidence, and the modal for focused consent. Reuse `OnboardingStepperComponent` from onboarding only if three visible stages genuinely need progress indication; it is not required for the first implementation. The agent recommendation list is agent-specific, so copy its interaction pattern, not its component or types.

All new Angular components: `standalone: true`, `ChangeDetectionStrategy.OnPush`, `input()`/`input.required()` and `output()` for presentation boundaries. The page uses `inject()` and `signal()`/`computed()` for draft selection, stages, pending state and errors. Track rows by stable `source + '/' + skillId`. Use accessible headings, field labels, live loading status, `role="alert"` for failures, keyboard-operable checkbox/button controls, and focus restoration after consent. Match the existing 760 px onboarding layout and surface tokens.

## Data flow and host boundary

1. On entering review, the page calls `wizard:recommend-skills` with the workspace tech stack (dependencies from `package.json` - backend reads these directly) through `ClaudeRpcService`. If a `DeepProjectAnalysis` is available (from `wizard:deep-analyze` or `wizard:load-analysis`), also call `wizard:get-project-guidance` to show guidance facts. Show recommendations and guidance as primary results. Add `wizard:search-skills` as an additional search option for users to find more skills beyond recommendations. Debounce search and discard stale responses.
2. Keep selected entries as canonical `source/skillId` values. The UI never injects `SkillRecommendationService`, `SkillSelectionService`, `SkillGuidanceService`, `SkillConsentService`, a filesystem service, or an HTTP client. The backend owns relevance, catalog lookup, script detection, hashes, and installation. Show recommendation `evidence` and score only when returned; do not imply the score is a percentage without a documented range.
3. Before an install attempt, the host must provide a preview for each selected skill: canonical ID, script presence, displayable script/file summary, and the content hash that will be installed. The page derives `SkillConsentRecord` (`skillName`, `contentHash`, `consentDate`) only after an explicit approval of that exact preview. It sends selected IDs and consent records to `wizard:install-skills-with-consent`; the host revalidates each hash against staged content. A changed hash requires a fresh preview and approval. Do not fabricate hashes in the webview.
4. If installation succeeds, call the existing `launchTeamBuilder(intent, attachmentSnapshot, { signal })`. Preserve the intent and attachments through the review stages; take the attachment snapshot at final launch. On success, the launcher opens chat as today. On failure, keep the draft and show a retry/skip route appropriate to the operation. Disable duplicate submits while install or launch is pending.

Use the typed RPC registry in `libs/shared/src/lib/types/rpc.types.ts` and check each `RpcResult` success/data before changing stage. The existing `HarnessChatLauncherService` is the only bridge to chat creation. Host RPC is the only bridge for skill processing; this remains suitable for Electron and the shared host.

## Implementation notes (Phase 3)

- `wizard:recommend-skills`, `wizard:search-skills`, and `wizard:get-project-guidance` are now wired to real services (B7). Backend reads workspace dependencies directly; frontend passes analysis when available.
- `wizard:preview-skills-for-consent` endpoint added (B7) and `wizard:install-skills-with-consent` validates preview hash against staged content.
- Recommendations show detected tech stack first; search is an additional option for finding more skills.
- A three-route skill wizard and three parallel wizard components add complexity without current need. Extract one review component and one consent view only when the existing page template warrants it.

## Verification against current code

Checked `team-builder-start.page.ts`, `onboarding.routes.ts`, `harness-chat-launcher.service.ts`, `choose-agents.page.ts`, the shared skill RPC types/registry, host skill handlers, and `libs/frontend/ui` exports. This plan keeps the `/onboarding/team-builder` entry and launcher behavior, uses standalone OnPush signal components, and routes all skill processing through `ClaudeRpcService`. It is a plan only; no rendered UI or runtime behavior was changed.
