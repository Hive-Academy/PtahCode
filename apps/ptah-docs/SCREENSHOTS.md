# Screenshots

WebP files live in `apps/ptah-docs/public/screenshots/` and are served at `/screenshots/<name>.webp`. Reference them from pages in `apps/ptah-docs/src/content/docs/`.

## Capture

Run the `ptah-docs:screenshots` and `ptah-docs:videos` targets under `node scripts/verify.mjs --exec --task docs-capture -- npx nx run <target>`. They run Playwright against the Electron app. Screenshot captures use 1600px full windows or focused panel crops and write WebP at quality 90, effort 6. Video captures write MP4 files to `public/assets/videos/`.

Each fixture creates one run directory under `<repo root>/.ptah/tmp/docs-capture/`; an absolute `PTAH_DOCS_CAPTURE_DIR` changes the base directory. The temporary Electron profile, database, `HOME`, `USERPROFILE`, `APPDATA`, and `LOCALAPPDATA` live there. Both fixtures check that the real `~/.ptah/settings.json` hash is unchanged after Electron closes. The fixture removes the run directory after closing; Windows file locks may retain it with a stderr notice. Set `PTAH_DOCS_KEEP_CAPTURE=1` to retain it for debugging.

The default source is `%APPDATA%\Ptah Dev`; `PTAH_DOCS_SOURCE_PROFILE` selects another source profile, except the real `~/.ptah` and paths inside it. The profile copy allowlist is empty, so ordinary captures copy no source files. Saved-session shots run only when `PTAH_DOCS_SESSION_WORKSPACE` names an existing workspace; ordinary shots use the throwaway sample repository. Saved-session mode opens that real workspace, which the app can write into, and copies only its `workspace-storage/<base64url-absolute-path>/` folder into the temporary profile and temporary home `.ptah`.

Saved-session mode attempts to refresh `chat-overview.webp`, `chat-execution-tree.webp`, `chat-cost-bar.webp`, and the three `sessions-*.webp` shots. It sends no AI prompt. Each image is staged in the run directory; the six images are copied to `public/screenshots/` only after all capture and privacy checks pass. These images have not yet been regenerated successfully; existing files may be stale and require inspection before commit.

- The mode copies only `ptah-dev.sqlite` and `sessions-dev.sqlite` with their present WAL/SHM sidecars from the original `~/.ptah/state` into the run directory. The files are checked for size and modification changes during copying; originals are not opened by SQLite or written. `PTAH_DB_PATH` and `PTAH_SESSIONS_DB_PATH` point at the copies. A database that changes without a detectable size or mtime change can still produce an inconsistent copy.
- A copied development database may have a schema newer than the Electron build. That mismatch can cause `PERSISTENCE_UNAVAILABLE` and prevent a capture. Use a matching build and database; this harness does not migrate the copy.
- Saved Claude transcripts cannot replay in this isolated mode. The app's readers use `os.homedir()/.claude/projects` in `jsonl-reader.service.ts` and `session-rpc.handlers.ts`; the temporary home has no transcripts. `CLAUDE_CONFIG_DIR` affects Claude CLI login in live mode, not those readers. D14 disallows further live prompts, so the live shot is disabled and this harness does not set `CLAUDE_CONFIG_DIR`.
- The model selector shot masks displayed per-model price text and asserts no price remains before capturing `chat-model-selector.webp`. It does not change app source or model data.

Every screenshot and video must be inspected for private data before commit.

## Check references

Run `node apps/ptah-docs/scripts/check-screenshot-refs.mjs`. It fails if a docs page references a missing screenshot. `ptah-docs:check-screenshots` runs the same check.
