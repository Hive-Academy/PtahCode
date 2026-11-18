# Bots phase 1 - context

Program definition: `bots-definition.md` in this folder (copy of
`TASK_2026_2261_63e3/task-description.md` at commit `ddd5dd810`, PR #1410). The section
"Phase 1 - Audit, record and manual editor" is the scope of this task.

## User decisions (2026-11-18)

The user approved the recommended option for each of the seven decisions of the definition
(see "Selected options" in `bots-definition.md`). Phase 1 uses decisions 1, 3, 5 and 6.

Not approved yet: the UI design of the Bots list and the create/edit form. The user must
approve `design-spec.md` and `prototype/` before any UI code is written. No removal is approved.

## Order of work

1. `consumer-and-storage-audit.md` (first deliverable of the phase; read-only).
2. `design-spec.md` + `prototype/` for the Bots list and form -> user design approval.
3. `implementation-plan.md` from the audit and the definition -> review -> batches.
4. Implementation (execution stays disabled), checks, Electron visual review, PR.

## Environment notes

- Git hooks do not run in a worktree (`.husky/_` is absent). The coordinator runs commitlint,
  the home-path guard (`node scripts/check-home-paths.mjs <files>`) and formatting by hand.
- Lanes run only focused checks (jest by path, `tsc --noEmit --project`, `eslint <files>`).

## User decisions (2026-11-18, second set)

The user said "go with your recommendation". The recommended option of each open decision is
selected:

- Design 1: entry point = a "Bots" tab in the title bar.
- Design 2: the Enabled toggle is shown in phase 1, with the hint that it has no effect yet.
- Design 3: import of saved custom agents = the "Preview later" placeholder in the list.
- Design 4: user-scoped bots show in each workspace with the "User" badge.
- Review 1: after a hard delete the record keeps id, scope, workspace root and retention only.
- Review 2: import in phase 1 = backend preview only.
- Review 3: the import ledger table is deferred to the phase that adds import commit.

The implementation plan is still in revision. The user has not approved the plan yet.

## User requirements added 2026-11-18 (after the design review)

The user said the bots design is fine, and added these requirements (user-requested):

- UR1 Setup wizard: the agent must be able to generate bots through the setup wizard, along the
  skills step.
- UR2 Main agent: bots are used by the main agent and shown there in a way similar to CLI lanes.
- UR3 Providers: a bot can have a different provider, either a main provider or a CLI lane
  provider. The initial default is the same as the default provider.
- UR4 Use: bots are utilized the same way as plain lanes.

Coordinator mapping (proposal, not approved by the user yet):

- UR3 changes the phase 1 record: the runtime field must hold "follow the default provider"
  (default), an explicit main provider, or a CLI lane provider. Phase 1 stores and edits it.
- UR2 and UR4 need execution. Phase 1 keeps execution disabled, so they go to phase 2b
  (conversation, run history and delegation).
- UR1 goes to phase 4 (designer output into the phase 1 editor), with the skills step of the
  setup wizard as the entry point.

- UR5 (user, 2026-11-18, later message): bots have an image or an icon that users and agents
  can set. Coordinator mapping (proposal): phase 1 stores the field in the record and the manual
  editor sets it. It is an editable field of `bots:create` / `bots:update`, so an agent-facing
  surface of a later phase can set it through the same contract. It adds one control to the
  approved design (an avatar in the list row and in the editor).

## User approval (2026-11-18)

The user approved the revised phase 1 plan (revision 3), the design with the UR5 design delta
(avatar in the list row and in the Identity section), and the phase order: UR3 and UR5 in
phase 1, UR2 and UR4 in phase 2b, UR1 in phase 4.
