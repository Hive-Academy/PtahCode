# Form control adoption, lane 8

## Files changed and DOM delta

- `agent-steer-input.component.ts`: the inline steer input now uses `ptahInput` at `xs`; its layout classes remain. The composer textarea stays raw as requested.
- `permissions/deny-message-popover.component.ts`: the message input now uses `ptahInput` at `xs`; its native input and bindings remain.
- `setup-plugins/skill-sh-browser.component.ts`: the search input now uses `ptahInput` at `sm` with its icon spacing and width classes retained.
- `setup-plugins/plugin-catalog-panel.component.ts`: the search input uses `ptahInput`; the skill checkboxes use `ptahCheckbox`; the plugin switch uses `ptahToggle`. Native input elements, sizes, bindings and layout classes remain.
- `setup-plugins/mcp-directory-browser.component.ts`: search and required text inputs use `ptahInput`; target checkboxes use `ptahCheckbox`. Required fields use stacked `ptah-field` labels and hints. The required choice `<select>` became a `ptah-select` combobox; its value change updates the same input-value state. The secret badge keeps its classes.
- `setup-plugins/mcp-directory-browser.component.spec.ts`: the required-choice selector and interaction now target the rich select trigger and option.

## Left raw

- `question-card.component.ts`: `checkbox-info` and `input-info` require an info variant that the owners do not provide. Radio inputs remain raw by the brief's exception.
- `agent-steer-input.component.ts`: the composer textarea is the chat composer exception.
- All button, badge and alert recipes remain unchanged.

No other spec selectors needed updates. No verification commands were run, as requested. The available CLI tools exposed skill search but no skill invocation mechanism, so no matching skill could be loaded.
