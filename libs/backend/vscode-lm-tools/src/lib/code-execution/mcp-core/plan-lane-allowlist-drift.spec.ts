/**
 * Drift guard for the Plan-lane Ptah tool allowlist (TASK_2026_1172_fd37, D18).
 *
 * `PLAN_LANE_PTAH_TOOLS` (agent-sdk) is a hand-kept subset of the read-only
 * tools in the caller-policy table. If a tool on that list is reclassified as
 * non-read here, a Plan lane would keep it allowed. This spec fails instead.
 * The intended exceptions are the lane's own tools: `ptah_agent_report`, its
 * channel to report "BLOCKED: plan mode", and `ptah_agent_message_ack`, the
 * ack of a message delivered to it. The caller policy binds both to the lane.
 */
import 'reflect-metadata';
import { PLAN_LANE_PTAH_TOOLS } from '@ptah-extension/agent-sdk';
import { isToolPermitted, toolClass } from './mcp-caller-policy';

const PTAH_PREFIX = 'mcp__ptah__';
const REPORTING_EXCEPTIONS = new Set(['ptah_agent_report', 'ptah_agent_message_ack']);

describe('Plan-lane Ptah tool allowlist', () => {
  const names = [...PLAN_LANE_PTAH_TOOLS].map((tool) =>
    tool.startsWith(PTAH_PREFIX) ? tool.slice(PTAH_PREFIX.length) : tool,
  );

  it('lists only prefixed Ptah tool names', () => {
    for (const tool of PLAN_LANE_PTAH_TOOLS) {
      expect(tool.startsWith(PTAH_PREFIX)).toBe(true);
    }
  });

  it('keeps the reporting tool and the message ack on the list', () => {
    expect(names).toContain('ptah_agent_report');
    expect(names).toContain('ptah_agent_message_ack');
  });

  it.each([...REPORTING_EXCEPTIONS])('keeps the lane-own tool %s limited to the bound lane', (name) => {
    expect(isToolPermitted(name, 'lane-report')).toBe(true);
    expect(isToolPermitted(name, 'read-only')).toBe(false);
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
