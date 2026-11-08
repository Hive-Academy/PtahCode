# Screenshots

WebP files live in `apps/ptah-docs/public/screenshots/` and are served at `/screenshots/<name>.webp`. Reference them from pages in `apps/ptah-docs/src/content/docs/`.

## Capture

Run the `ptah-docs:screenshots` and `ptah-docs:videos` targets under `node scripts/verify.mjs --exec --task docs-capture -- npx nx run <target>`. They run Playwright against the Electron app. Screenshot captures use 1600px full windows or focused panel crops and write WebP at quality 90, effort 6. Video captures write MP4 files to `public/assets/videos/`.

Each fixture creates one run directory under `<repo root>/.ptah/tmp/docs-capture/`; an absolute `PTAH_DOCS_CAPTURE_DIR` changes the base directory. The temporary Electron profile, database, `HOME`, `USERPROFILE`, `APPDATA`, and `LOCALAPPDATA` live there. Both fixtures check that the real `~/.ptah/settings.json` hash is unchanged after Electron closes. The fixture removes the run directory after closing; Windows file locks may retain it with a stderr notice. Set `PTAH_DOCS_KEEP_CAPTURE=1` to retain it for debugging.

All screenshots use the throwaway sample repository. Chat-session and session-list screens are described in text on purpose: images go stale quickly and can expose private session content.

- The model selector shot masks displayed per-model price text and asserts no price remains before capturing `chat-model-selector.webp`. It does not change app source or model data.

Every screenshot and video must be inspected for private data before commit.

## Check references

Run `node apps/ptah-docs/scripts/check-screenshot-refs.mjs`. It fails if a docs page references a missing screenshot. `ptah-docs:check-screenshots` runs the same check.
