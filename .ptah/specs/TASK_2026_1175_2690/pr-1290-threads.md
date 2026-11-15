## apps/ptah-electron/src/di/phase-2-libraries.ts:363

### 🟠 Major · Routing reads phase requirements from inactive user clones

**Impact:** Routing can enforce stale or unrelated machine capabilities instead of those of the phase definition available to the workspace, admitting unsuitable lanes or excluding suitable ones\.

Both host registrations leave the clone activity callback at its always\-true default, so an existing phase file wins even when the workspace excludes or disables that clone\.

**Evidence**

- [apps/ptah\-electron/src/di/phase\-2\-libraries\.ts:339](https://github.com/Hive-Academy/PtahCode/blob/912bb168c566a774a95369a3cb1ed9c233576ca3/apps/ptah-electron/src/di/phase-2-libraries.ts#L339) — new PhaseDefinitionFileReader\( \.\.\. getPluginsPath\(\), \)

- [libs/backend/lane\-routing/src/lib/phase\-definition\-file\.reader\.ts:13](https://github.com/Hive-Academy/PtahCode/blob/912bb168c566a774a95369a3cb1ed9c233576ca3/libs/backend/lane-routing/src/lib/phase-definition-file.reader.ts#L13) — private readonly isCloneActive: \(\) =&gt; boolean \| Promise&lt;boolean&gt; = \(\) =&gt; true

- [libs/backend/lane\-routing/src/lib/phase\-definition\-file\.reader\.ts:20](https://github.com/Hive-Academy/PtahCode/blob/912bb168c566a774a95369a3cb1ed9c233576ca3/libs/backend/lane-routing/src/lib/phase-definition-file.reader.ts#L20) — const root = await this\.isCloneActive\(\) &amp;&amp; await this\.fs\.exists\(clonePhase\) ? clone : \.\.\.

- [libs/backend/harness\-sync/src/lib/manifest/harness\-manifest\.builder\.ts:516](https://github.com/Hive-Academy/PtahCode/blob/912bb168c566a774a95369a3cb1ed9c233576ca3/libs/backend/harness-sync/src/lib/manifest/harness-manifest.builder.ts#L516) — if \(disabled\.has\(slug\)\) continue;

- [libs/backend/harness\-sync/src/lib/manifest/harness\-manifest\.builder\.ts:528](https://github.com/Hive-Academy/PtahCode/blob/912bb168c566a774a95369a3cb1ed9c233576ca3/libs/backend/harness-sync/src/lib/manifest/harness-manifest.builder.ts#L528) — if \(selected \!== null &amp;&amp; \!selected\.has\(slug\)\) \{

- [libs/backend/lane\-routing/src/lib/route\-decide\.service\.ts:331](https://github.com/Hive-Academy/PtahCode/blob/912bb168c566a774a95369a3cb1ed9c233576ca3/libs/backend/lane-routing/src/lib/route-decide.service.ts#L331) — const text = await reader\.read\(phase\.kind\);

<details><summary>Prompt for AI agents</summary>

Resolve the phase definition against the same workspace\-scoped activation and selection state used for skill propagation, and wire that context through both Electron and CLI routing hosts\. Add coverage for a retained inactive clone with different requirements\.

</details>

<!-- ptah-review:finding:01M7EDNBNFMK510KXRH1FCGQNH -->

## libs/backend/lane-routing/src/lib/phase-definition-file.reader.ts:18

### 🟠 Major · Routing ignores workspace\-owned orchestration phase definitions

**Impact:** Machine capability filtering can use requirements different from the phase that the agent actually executes\.

The phase reader only examines the global user clone and the installed plugin, even when the workspace uses its own orchestration skill\.

**Evidence**

- [libs/backend/lane\-routing/src/lib/phase\-definition\-file\.reader\.ts:18](https://github.com/Hive-Academy/PtahCode/blob/912bb168c566a774a95369a3cb1ed9c233576ca3/libs/backend/lane-routing/src/lib/phase-definition-file.reader.ts#L18) — const clone = join\(this\.userSkillsRoot, 'orchestration'\);

- [libs/backend/lane\-routing/src/lib/phase\-definition\-file\.reader\.ts:22](https://github.com/Hive-Academy/PtahCode/blob/912bb168c566a774a95369a3cb1ed9c233576ca3/libs/backend/lane-routing/src/lib/phase-definition-file.reader.ts#L22) — : join\(this\.pluginsRoot, 'ptah\-core', 'skills', 'orchestration'\);

- [libs/backend/harness\-sync/src/lib/targets/claude\-target\.symlink\-migration\.spec\.ts:189](https://github.com/Hive-Academy/PtahCode/blob/912bb168c566a774a95369a3cb1ed9c233576ca3/libs/backend/harness-sync/src/lib/targets/claude-target.symlink-migration.spec.ts#L189) — leaves the USER's own symlink at a desired path alone and reports it foreign

- [libs/backend/lane\-routing/src/lib/route\-decide\.service\.ts:331](https://github.com/Hive-Academy/PtahCode/blob/912bb168c566a774a95369a3cb1ed9c233576ca3/libs/backend/lane-routing/src/lib/route-decide.service.ts#L331) — const text = await reader\.read\(phase\.kind\);

<details><summary>Prompt for AI agents</summary>

Resolve phase definitions from the actual workspace and harness skill selected for the caller, including preserved workspace\-owned skills, and test capability routing when it differs from the global clone\.

</details>

<!-- ptah-review:finding:01M7EDNBNHW2HWJZREWWZDWFXN -->

