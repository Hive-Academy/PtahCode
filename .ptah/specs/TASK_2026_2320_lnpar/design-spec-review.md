# Design Spec Review - TASK_2026_2320_lnpar

## Record

| Field | Value |
| --- | --- |
| Artifact | `design-spec.md` (Revision 1, 272 lines), `prototype/README.md`, `prototype/index.html`, `prototype/screenshots/` (44 PNGs, re-captured), `parity-inventory.md` Revision 2 (design) |
| Reviewed revision | **Revision 1** (round 1 recheck). Round 0 reviewed the initial draft |
| Completed revise rounds | **1** |
| Author | ui-ux-designer subagent (Claude) |
| Reviewer | general-purpose subagent (Claude) |
| Execution sides | Same side (Claude / Claude). No CLI lane can be started in this session, so this is weaker evidence than an opposite-side review. |
| Render evidence | Chrome via Playwright (headless), not Electron. The visual-review phase must repeat the checks in Electron (CLAUDE.md "Product focus"), including both Anubis themes for the shared queued-card fix (decisions.md 9). |
| Binding user decisions | decisions.md 7 (chevron dropped; lanes use Ctrl+Enter plus the queued-card action), 8 (lanes get main chat's compact bar unchanged), 9 (contrast fixed in the shared `QueuedFollowUpsComponent`) |
| Method | Read-only. Read the revised spec, README and parity Revision 2 note. Read source to check feasibility: `queued-follow-ups.component.ts:159-170` (statusLabel), `session-inspector.component.ts:200-208` (sessionTokens), `chat-input.component.ts:824` ("Ptah is working…"). Contrast was recomputed from the `tailwind.config.js` tokens in round 0. No builds, tests, nx or verify. |
| Screenshots viewed (round 1) | dark-all-idle-wide and light-all-idle-wide (main beside canvas 720, card 400 and inspector 320), anubis-light-running-queued (folded bar, queued cards, all mounts), dark-compact-bar-running (all mounts), light-disabled-controls-opencode (all mounts), dark-slash-skills-only-codex, dark-model-changed-next-process-agy, dark-model-pending-confirmed-old |
| Verdict | **APPROVED** (round 1), with non-blocking notes N1-N4 and one escalation (OQ5) |

## 1. Round 0 findings: recheck

| # | Round 0 finding | Revision 1 change | Evidence | Status |
| --- | --- | --- | --- | --- |
| 1 | The main chat reference frame was not the real main chat | The frame was rebuilt: no hint line, status line holds only the auth label ("Claude Pro"), queued card in the transcript with Withdraw and "Interrupt & send", compact bar "Ptah is working…" | dark/light-all-idle-wide, anubis-light-running-queued, dark-compact-bar-running; spec:11 | **Resolved** |
| 2 | Lane-only Send options chevron | Removed. Send now is reached by Ctrl+Enter and the queued-card button. Parity A row = move (user, decisions.md 7) | spec:53,71; README "Removed in revision 1"; no chevron in any screenshot | **Resolved** |
| 3 | Queued card re-specified (Edit, `rounded-xl text-xs`) | Shared card markup (`rounded-2xl ... text-sm`, `max-w-[85%]`, right-aligned), one label **Withdraw**, status "Queued for the next turn". This matches `statusLabel` `queued` at `queued-follow-ups.component.ts:167-168` | spec:151-153; anubis-light-running-queued | **Resolved** (see N1) |
| 4 | Compact fold dropped; 40 px inspector variant | Main chat's compact bar and type-to-expand in every mount (spec 2.1). 60 px textarea everywhere. Parity A/D rows updated (Revision 2) | spec:31,35-43; dark-compact-bar-running; README:142,144 | **Resolved** |
| 5 | Claude shown as steer by default | Default is "Interrupt & send" (Req 2.5). The steer variant carries the Q1 caveat ("or starts the next turn if this one ends first") | spec:115,128,167-169 | **Resolved** |
| 6 | "No slash commands or skills" not backed by research | `/` commands and `/` skills are separate columns and separate list groups. The copy is marked as a backend-owned placeholder, and the harness-sync evidence is cited with its limit (sync, not typed `/`) | spec:113-126,132; dark-slash-skills-only-codex | **Resolved** |
| 7 | Antigravity stream-json "new process each turn" was wrong; effort was inconsistent | New "Next process start" class with its own footer and status copy. Model and effort are treated the same. The conflict with Req 2.7 is raised as OQ5 | spec:123,127,142,145,264; dark-model-changed-next-process-agy | **Resolved**; OQ5 escalated (section 4) |
| 8 | Disabled approval chip read "Ask" | Shows the effective mode ("Auto") from `effectiveApproval` in the capability statement. It reads "Checking" or "Unknown" in states 4.8 and 4.9 | spec:64,107,116-123; light-disabled-controls-opencode, dark-slash-skills-only-codex | **Resolved** |
| 9 | OpenCode images, ACP image gate, agy ACP steer named Grok | OpenCode images are Off with a "not confirmed" reason that cites Q6. ACP images apply "only when the agent reports image input". Grok and Antigravity ACP rows are split, each with its own steer reason | spec:120-122,134 | **Resolved** |
| 10 | Send `aria-disabled` wrongly tagged `[main]` | Send keeps main chat's real `disabled` attribute (`chat-input.component.ts:498-500`). The reason is always on the status line | spec:69,105,250 | **Resolved** (see N2) |
| 11 | Req 3.3 session totals and Req 2.7 confirmed-model surface missing | 7.1: a confirmed-model chip in the lane header (the compact bar's chip look); the dot clears when the chip updates. 7.2: reuses the inspector SESSION section (`sessionTokens`, verified at `session-inspector.component.ts:200-208`) | spec:187-193; dark-model-pending-confirmed-old, all-idle-wide | **Resolved** |
| 12 | "Waiting for you" vs "Waiting on you" | One string, "Waiting for you" | spec:207; README constraint 10 | **Resolved** |
| 13 | README constraint list incomplete | 12 numbered constraints, plus a separate `[shared-fix]` table and a "Removed in revision 1" list | README "Lane-introduced constraints" | **Resolved** |

## 2. User intent: identical design and function (round 1)

The side-by-side screenshots now compare the lane with the real main chat composer. At 720, 400 and 320 px, in dark and light, the lane shows the same card, the same toolbar order (attach, approval, model · effort, mic, Stop, Send), the same compact bar, and the same queued card with the same labels. The remaining differences come from lane capability or lane identity, and each is listed as a README constraint:
- the status-line hint (C1);
- Ctrl+Enter (C2);
- disabled-control treatment (C3);
- queued-card placement in mounts without a transcript, and the disabled Send now (C4);
- the lane header row with usage and the confirmed-model chip (C7);
- the lane badge on prompts (C8);
- "N limited" (C9);
- the "{CLI} is working…" subject (C12);
- Resume session (parity B).

None is a lane-only restyle.

The Anubis-light screenshot shows the shared fix: "Queued" is now dark `base-content`, not the 1.37:1 teal. Round 0 already confirmed the before values from the tokens (2.01 / 2.46 / 1.37 / 3.46). The after values (14.28+ and 5.28+) are the designer's Chrome measurements and are plausible for `base-content` and the state-need ink. The Electron visual review must confirm them.

## 3. Requirement trace (round 1 deltas only)

All Req 1, 2, 3 and 5 UI rows traced in round 0 still trace. The previously partial or missing rows are now covered:
- 1.1 (toolbar order: chevron gone);
- 1.4 (commands and skills groups);
- 2.5 (Claude default is interrupt);
- 2.7 (confirmed-model chip, 7.1);
- 3.3 (inspector SESSION section, 7.2);
- 5.6 (effective-mode chip).

For 2.7, the Antigravity stream-json transport is the one exception (OQ5).

## 4. New items checked

- **Open Question 5 (agy stream-json vs Req 2.7).** Accept the design treatment: the "Next process start" copy is honest and matches research Q8 (NDJSON continuation in one process; `--model` with the effort suffix only at spawn). Req 2.7 says a change "applies from the next turn ... the lane shall not restart". Stream-json cannot meet that without a respawn. This is a requirement-level decision, not a design defect. **Escalate to the architect and the user gate** with these options: (a) accept a documented Req 2.7 exception for stream-json, with the copy as designed; (b) route model and effort changes for agy through the ACP transport (research recommends this); (c) respawn the process with resume when the model changes, which conflicts with "shall not restart". Reviewer recommends (b), with (a) as the fallback copy.
- **Commands / Skills split.** Accept. Two groups, each with its own disabled reason row, and a combined single row when the lane has neither (spec 5.3). The Codex screenshot shows "No slash commands in Codex lanes." beside a selectable skill. The cells are labelled illustrative; the capability statement decides (OQ4).
- **Confirmed-model chip.** Accept. It uses the compact bar chip's look, shows the confirmed model and not the pending pick, and gives Req 2.7's dot something to clear against. The same chip feeds the compact bar. It truncates gracefully at 320 ("oc-mode…" in light-disabled-controls-opencode); the full name must be in `title` (N3).

## 5. Lane-proposed constraints (README 1-12)

| # | Constraint | Decision | Reason |
| --- | --- | --- | --- |
| 1 | Per-mode hint on the status line; main chat's status line unchanged | **Accept** | Parity A keeps the `aria-live` hint. Main chat's slot is reused, and main chat is unaffected (verified in the reference frame). |
| 2 | Ctrl/Cmd+Enter = Send now in the lane textarea only | **Accept** | User decision 7 named Ctrl+Enter explicitly. The shortcut is invisible, so main chat looks the same, and parity A keeps the shortcut. |
| 3 | Disabled model/effort/approval: `aria-disabled`, dashed edge, info glyph, `aria-describedby`, status-line reason; chip shows effective mode | **Accept** | Forced by Req 1.10. Main chat never disables these controls. Build it once in the shared controls (spec 13). |
| 4 | Queued cards above the composer in mounts without a transcript; disabled Send now with reason when the lane has none | **Accept** | Forced by the mounts (card and inspector have no transcript) and by Req 2.4. See N1 on the component inputs this needs. |
| 5 | `state-*` ink tokens for new lane text | **Accept** | Contrast defect confirmed in round 0 (2.01 / 2.46). |
| 6 | "Interrupt & send" when the turn ends, "Send now" when the message joins it; Claude defaults to interrupt | **Accept** | Generalises main chat's `isClaude()` switch to the capability statement, and matches Req 2.5. |
| 7 | Lane header: usage figure, turn-end clock, "partial" badge, confirmed-model chip | **Accept** | Req 3.1, 3.4-3.6 and 2.7 need a surface. Reuses existing looks. |
| 8 | Lane-name outline badge on permission and question cards | **Accept** | Req 5.1 and 5.3 (a prompt must never be mistaken for another lane's). |
| 9 | "N limited" neutral badge (hint, not a button), hidden at <=400 | **Accept** | Lane-forced: several controls can be disabled at once. The status-not-a-button rule is respected. |
| 10 | One waiting badge "Waiting for you" in all three surfaces | **Accept** | Req 5.1. Fixes round 0 finding 12. |
| 11 | Commands and Skills as two groups in the `/` list | **Accept** | Req 1.4. A lane can take skills without commands. |
| 12 | Compact bar label "{CLI} is working…" (main: "Ptah is working…", `chat-input.component.ts:824`) | **Accept** | Only the subject changes, and it must name the lane. The label must still follow main chat's compacting variant ("Optimizing context…") if lanes ever report compaction. Not needed now. |
| shared-fix | `QueuedFollowUpsComponent`: "Queued" `text-base-content`, note `text-state-need` | **Accept** | User-approved (decisions.md 9). The main chat look changes in both Anubis themes; Electron visual review required. |

## 6. Parity (Revision 2)

The parity-inventory Revision 2 note matches the user decisions:
- "Send now menu" becomes a **move** to the queued card and Ctrl+Enter (user-approved).
- "Edit a queued message" keeps its behaviour under the label Withdraw.
- "Full vs compact variants" is replaced by main chat's compact bar.
- D "Compact bar / type-to-expand" stays expose and is now honoured.

The README Parity Mapping now points the compact row to spec 2.1 (the wrong reference to 4.7 is fixed). There are no removals and no silent drops. Sections B, C and E are unchanged since round 0.

## 7. Non-blocking notes for the architect (no artifact revision needed)

- **N1** (`design-spec.md:151,159`; README constraint 4). Spec 6.1 says the shared card is rendered "unchanged". Visually it is, but the lane needs new inputs on the shared component:
  - a capability-driven label in place of `isClaude()` (`queued-follow-ups.component.ts:101-106`);
  - an `aria-disabled` Send now with a reason (main chat hides the button);
  - the "Sent by the parent session" receipt line in place of Withdraw;
  - a lane data source in place of `QueuedFollowUpStore`.

  The architect should plan these as inputs on the shared component, not as a fork, and keep `chat-input` specs selector-only.
- **N2** (`design-spec.md:69,105`). Send keeps the `disabled` attribute and is not focusable. Req 1.10 asks that a disabled control be reachable and its reason heard. The design meets the "heard" part through the `aria-live` status line and the "Can't send" tray badge, but not the "reach it" part for Send itself. This is a deliberate parity-with-main trade-off; record it as a Req 1.10 exception in decisions.md at the gate.
- **N3** (light-disabled-controls-opencode, inspector 320). The header model chip and status badge truncate ("oc-mode…", "Runni…"). Put the full value in `title` and the accessible name.
- **N4** (`design-spec.md:145` vs dark-model-pending-confirmed-old). Minor copy drift: the spec says "Applies from your next message. The lane keeps running.", while the prototype reads "…next message; the lane keeps running." Pick one string at implementation.

## 8. Unresolved items for the gate

- OQ5 (Antigravity stream-json vs Req 2.7): requirement-level choice; options and recommendation in section 4.
- N2: record the Send `disabled` exception to Req 1.10.
- Evidence limits: same-side review; Chrome (Playwright), not Electron; no screen reader run. The Electron visual review must also cover both Anubis themes for the shared queued-card fix.

## 9. Round 0 record (kept for continuity)

Round 0 (initial draft) verdict: **REVISE**, 13 findings. Contrast claims were confirmed from the tokens: `text-warning` 2.01 on ptah-glass-light and 2.46 on anubis-light; `text-primary` "Queued" on primary/5 1.37 on anubis-light and 3.46 on anubis, passing on both ptah-glass themes. Round 0 recommended fixing the shared `QueuedFollowUpsComponent` in this task; the user adopted that as decisions.md 9. All 13 findings are resolved in Revision 1 (section 1).
