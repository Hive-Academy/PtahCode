/**
 * Drift guard for the Plan-lane Ptah tool allowlist (TASK_2026_1172_fd37, D18).
 *
 * `PLAN_LANE_PTAH_TOOLS` (agent-sdk) is a hand-kept subset of the read-only
 * tools in the caller-policy table. If a tool on that list is reclassified as
 * non-read here, a Plan lane would keep it allowed. This spec fails instead.
 * `ptah_agent_report` is the one intended exception: it is the lane's own
 * channel to report "BLOCKED: plan mode".
 */
import 'reflect-metadata';
import { PLAN_LANE_PTAH_TOOLS } from '@ptah-extension/agent-sdk';
import { toolClass } from './mcp-caller-policy';

const PTAH_PREFIX = 'mcp__ptah__';
const REPORTING_EXCEPTIONS = new Set(['ptah_agent_report']);

describe('Plan-lane Ptah tool allowlist', () => {
  const names = [...PLAN_LANE_PTAH_TOOLS].map((tool) =>
    tool.startsWith(PTAH_PREFIX) ? tool.slice(PTAH_PREFIX.length) : tool,
  );

  it('lists only prefixed Ptah tool names', () => {
    for (const tool of PLAN_LANE_PTAH_TOOLS) {
      expect(tool.startsWith(PTAH_PREFIX)).toBe(true);
    }
  });

  it('keeps the reporting tool on the list', () => {
    expect(names).toContain('ptah_agent_report');
  });

  it.each(names.filter((name) => !REPORTING_EXCEPTIONS.has(name)))(
    'classifies %s as a read tool in the caller policy',
    (name) => {
      expect(toolClass(name)).toBe('read');
    },
  );

  it.each(['ptah_agent_spawn', 'execute_code', 'ptah_agent_message'])(
    'does not allow %s in a Plan lane',
    (name) => {
      expect(names).not.toContain(name);
    },
  );
});
