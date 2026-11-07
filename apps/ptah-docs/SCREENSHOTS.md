# Screenshots

WebP files live in `apps/ptah-docs/public/screenshots/` and are served at `/screenshots/<name>.webp`. Reference them from pages in `apps/ptah-docs/src/content/docs/`.

## Capture

Run the `ptah-docs:screenshots` and `ptah-docs:videos` targets under `node scripts/verify.mjs --exec --task docs-capture -- npx nx run <target>`. They run Playwright against the real Electron app. Screenshot captures use 1600px full windows or focused panel crops and write WebP at quality 90, effort 6. Video captures write MP4 files to `public/assets/videos/`.

Each fixture creates one run directory under `<repo root>/.ptah/tmp/docs-capture/`; an absolute `PTAH_DOCS_CAPTURE_DIR` changes the base directory. The temporary Electron profile, database, `HOME`, `USERPROFILE`, `APPDATA`, and `LOCALAPPDATA` all live there. The app uses the isolated home. Both fixtures check that the real `~/.ptah/settings.json` hash is unchanged after Electron closes. The fixture removes the run directory after closing; Windows file locks may retain it with a stderr notice. Set `PTAH_DOCS_KEEP_CAPTURE=1` to retain it for debugging.

The default source is `%APPDATA%\Ptah Dev`; `PTAH_DOCS_SOURCE_PROFILE` selects another source profile, except the real `~/.ptah` and paths inside it, which are refused. The profile copy allowlist is empty, so ordinary captures copy no files from the source. Saved-session shots run only when `PTAH_DOCS_SESSION_WORKSPACE` explicitly names an existing workspace; otherwise they skip and ordinary shots use the throwaway sample repository. This mode copies only that workspace's `workspace-storage/<base64url-absolute-path>/` folder into the temporary Electron profile and temporary home `.ptah`. It opens the named real workspace, and the app can write into it. Captures may also write synthetic `global-state.json` workspace folders into the temporary profile.

Every screenshot and video must be inspected for private data before commit.

## Not produced by the harness

- `sessions-overview.webp` (used by `sessions/index.mdx`)
- `sessions-tabs.webp` (used by `sessions/managing-sessions.md`)
- `sessions-history.webp` (used by `sessions/session-history.md`)

These three images need saved session state. No current shot regenerates them; they are maintained manually until a saved-session capture is available.

## Check references

Run `node apps/ptah-docs/scripts/check-screenshot-refs.mjs`. It fails if a docs page references a missing screenshot. `ptah-docs:check-screenshots` runs the same check.
