import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  MAX_AGENT_DESCRIPTION_CHARS,
  capDescription,
  truncateAgentDescription,
} from './regen-agents.mjs';

test('keeps descriptions within 200 characters at a word boundary', () => {
  const input = `${'role trigger boundary '.repeat(12)}end`;
  const output = truncateAgentDescription(input);
  assert.ok(Array.from(output).length <= MAX_AGENT_DESCRIPTION_CHARS);
  assert.ok(!output.endsWith(' '));
  assert.equal(input.slice(output.length, output.length + 1), ' ');
});

test('leaves short descriptions unchanged', () => {
  const input = 'One sentence: role, trigger, and boundary.';
  assert.equal(truncateAgentDescription(input), input);
});

test('falls back instead of emitting empty for an unbroken token or whitespace', () => {
  assert.equal(truncateAgentDescription('x'.repeat(201), 'safe agent'), 'x'.repeat(200));
  assert.equal(truncateAgentDescription('  \n ', 'safe agent'), 'safe agent');
});

test('counts Unicode code points without splitting surrogate pairs', () => {
  const output = truncateAgentDescription(`${'x'.repeat(199)}🚀tail`);
  assert.equal(Array.from(output).length, 200);
  assert.ok(output.endsWith('🚀'));
});

test('does not split dotted tokens and retains a word ending at code point 200', () => {
  const dotted = truncateAgentDescription(`${'A'.repeat(196)} v1.2.3 tail`);
  assert.equal(dotted, 'A'.repeat(196));
  const exact = `${'a'.repeat(195)} four more`;
  assert.equal(truncateAgentDescription(exact), exact.slice(0, 200));
});

test('normalizes and safely re-quotes YAML descriptions only in initial frontmatter', () => {
  const original = 'path \\ and "quoted"';
  const source = `---\r\nname: sample\r\ndescription: ${JSON.stringify(original)}\r\n---\r\nbody:\r\ndescription: body text\r\n`;
  const output = capDescription(source, 'sample');
  assert.match(output, /^---\r\nname: sample\r\ndescription: /);
  assert.match(output, /body:\r\ndescription: body text\r\n$/);
  const encoded = output.match(/^description: (.*)$/m)?.[1];
  assert.ok(encoded);
  assert.equal(JSON.parse(encoded), original);
  assert.equal(capDescription('---\ndescription: \'it\'\'s fine\'\n---\n', 'sample').includes("it's fine"), true);
});

test('uses a nonempty fallback for quoted whitespace descriptions', () => {
  const output = capDescription('---\ndescription: "  \\n "\n---\n', 'sample');
  assert.match(output, /description: "sample agent"/);
});
