import { execFileSync } from 'node:child_process';

import { PTAH_CORE_SYSTEM_PROMPT } from './ptah-core-prompt';
import { buildPtahFullPrompt, SYSTEM_PROMPT_DYNAMIC_BOUNDARY } from './ptah-full-prompt';

describe('buildPtahFullPrompt', () => {
  it('uses the boundary exported by the installed ESM SDK', () => {
    const sdkBoundary = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "import { SYSTEM_PROMPT_DYNAMIC_BOUNDARY } from '@anthropic-ai/claude-agent-sdk'; process.stdout.write(SYSTEM_PROMPT_DYNAMIC_BOUNDARY);",
      ],
      { encoding: 'utf8', timeout: 5_000 },
    );
    expect(SYSTEM_PROMPT_DYNAMIC_BOUNDARY).toBe(sdkBoundary);
  });

  it('keeps the static prompt within 16,000 characters and ends with the Ptah core', () => {
    const prompt = buildPtahFullPrompt();
    expect(buildPtahFullPrompt()).toBe(prompt);
    expect(prompt).toContain('For /<skill-name>, invoke it via Skill.');
    expect(prompt).toContain('Use they/them');
    expect(prompt).toContain('Keep private user and project details out of external services');
    expect(prompt.length).toBeLessThanOrEqual(16_000);
    expect(prompt).toMatch(/^You are Claude, running in Ptah/);
    expect(prompt.endsWith(PTAH_CORE_SYSTEM_PROMPT)).toBe(true);
  });
});
