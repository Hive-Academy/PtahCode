# Map new model family names to child-session tiers

Type: BUGFIX. Depth: minimal. Branch: `fix/child-model-tier-names`.

## Problem

`childModelTier()` in `libs/backend/lane-routing/src/lib/child-session/child-model-tier.ts`
sorts model ids by name tokens. It does not know the new family names, so all of them go to
tier 1 (balanced):

| Provider | Family name | Same level as | Wanted tier |
| --- | --- | --- | --- |
| OpenAI | astra | Fable | 3 (pin-only) |
| OpenAI | sol | Opus | 2 (strong) |
| OpenAI | terra | Sonnet | 1 (balanced) |
| OpenAI | luna | Haiku | 0 (small) |
| Antigravity (agy) | aragon | assumed Opus | 2 (strong) |
| Kimi, GLM | any | Sonnet | 1 (already the default) |

Antigravity also routes `opus` and `sonnet` ids, and new Gemini ids. Those already match the
existing tokens (`opus`, `pro` → 2; `flash`, `lite` → 0).

## Assumptions

- The user did not give a tier for `aragon`. It is set to tier 2 (strong). The user can change it.
- Kimi and GLM ids stay at the default tier 1. A test pins that.
</content>
</invoke>
