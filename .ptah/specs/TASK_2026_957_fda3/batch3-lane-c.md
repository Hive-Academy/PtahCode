# Batch 3 lane C (chat-ui)

Boundary: chat-ui (scope:webview) already imports `@ptah-extension/ui`. No blocker.

- cost-badge: `ptahBadge` tone ok (known cost) and neutral (not priced / unavailable, keeps `opacity-70`). Removed `ok-solid-text` (no solid fill now). Spec queries `[data-ptah-badge]`.
- duration-badge: `ptahBadge tone="neutral"`.
- status-badge: typed `tone` computed signal (pending neutral, streaming info, complete/resumed ok, interrupted warn, error err). Spec checks `data-tone`.
- token-badge: `ptahBadge appearance="outline"`, keeps `cursor-help`.
- agent-card-permission: `ptahBadge tone="warn"`.
- All five import `PtahBadgeDirective` and list it in `imports`.

Left raw: agent-card-output (two `badge badge-xs ... ptah-superpower-badge` spans). The global `.ptah-superpower-badge` class in `styles.css` gives a custom look. Adoption would change it.

Verify: `npm run verify -- -t test -p @ptah-extension/chat-ui -- --testPathPatterns="badge|agent-card"` passed. Typecheck and template check not run.
