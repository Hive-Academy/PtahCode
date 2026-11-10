## Changes
C13: Merged catalogs now retain every static model in order and append distinct live-only models; added union and invalid-payload specs.
C14: Kimi catalog URL now derives from the shared provider entry base URL; spec checks the exact fetch URL.
C15: HTTP failure and thrown fetch paths now debug-log status or error message and retain static models; specs check fallback and token exclusion.

## Decisions
Used the shared getAnthropicProvider export already available to the handler through a different package; moved the import to @ptah-extension/shared. Reversible.
Kept the existing mutable copy of static capability arrays to satisfy ProviderModelInfo[]; static model fields and order are preserved. Reversible.

## Verification
Formatted all four requested files with Prettier and reread the edits for type and lint issues. No test, build, Nx target, tsc, or diagnostics ran, by instruction.
The one required search found SDK_KIMI_CODE_AUTH at libs/backend/auth-providers/src/lib/di/register.ts:338 as a c.resolve(...) call.

## Open items
The single permitted search does not show the surrounding registration condition, so unconditional DI registration could not be confirmed from that line alone. No DI file was changed.
