import type { McpCallerBinding } from '@ptah-extension/platform-core';
import {
  applyPhaseToolFilter,
  isPhaseToolDenied,
  phaseDisallowedTools,
} from './mcp-caller-phase-filter';

const binding = (
  disallowedTools: readonly string[] | undefined,
  phaseKind = 'implement',
): McpCallerBinding => ({
  kind: 'agent',
  agentId: 'lane-a',
  capability: 'privileged',
  phaseKind,
  ...(disallowedTools ? { disallowedTools } : {}),
});

describe('mcp caller phase filter', () => {
  const tools = [
    { name: 'ptah_workspace_analyze' },
    { name: 'ptah_browser_navigate' },
    { name: 'ptah_browser_screenshot' },
    { name: 'ptah_task_create' },
    { name: 'execute_code' },
  ];

  it('drops blank names and treats an empty list as unfiltered', () => {
    expect(phaseDisallowedTools(undefined)).toBeUndefined();
    expect(phaseDisallowedTools(binding([]))).toEqual([]);
    expect(phaseDisallowedTools(binding(['', '  ']))).toBeUndefined();
    expect(phaseDisallowedTools(binding(['ptah_task_create']))).toEqual([
      'ptah_task_create',
    ]);
  });

  it('hides denied names and keeps the order of the tools that remain', () => {
    const filtered = applyPhaseToolFilter(
      tools,
      binding(['ptah_task_create', 'ptah_browser_navigate']),
    );
    expect(filtered.map((tool) => tool.name)).toEqual([
      'ptah_workspace_analyze',
      'ptah_browser_screenshot',
    ]);
    expect(isPhaseToolDenied('ptah_task_create', binding(['ptah_task_create']))).toBe(
      true,
    );
    expect(isPhaseToolDenied('execute_code', binding(['ptah_task_create']))).toBe(true);
    expect(
      isPhaseToolDenied('ptah_browser_screenshot', binding(['ptah_task_create'])),
    ).toBe(false);
  });

  it('keeps browser tools callable for a visual-review profile that denies none', () => {
    const visualReview = binding([], 'visual-review');
    expect(phaseDisallowedTools(visualReview)).toEqual([]);
    expect(applyPhaseToolFilter(tools, visualReview).map((tool) => tool.name)).toEqual(
      tools.map((tool) => tool.name),
    );
    expect(isPhaseToolDenied('ptah_browser_navigate', visualReview)).toBe(false);
    expect(isPhaseToolDenied('ptah_browser_screenshot', visualReview)).toBe(false);
  });

  it('fails closed for a malformed present phase and leaves an absent phase alone', () => {
    const malformed = binding(['  ']);
    expect(applyPhaseToolFilter(tools, malformed)).toEqual([]);
    expect(isPhaseToolDenied('execute_code', malformed)).toBe(true);
    expect(applyPhaseToolFilter(tools, undefined)).toEqual(tools);
  });
});
