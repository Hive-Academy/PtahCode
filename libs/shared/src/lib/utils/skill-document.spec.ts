import {
  normalizeDraftBody,
  serializeSkillDocument,
  skillDocumentSlug,
  validateSkillDocument,
} from './skill-document';

interface CurrentHarnessInput {
  readonly name: string;
  readonly description: string;
  readonly content: string;
  readonly allowedTools?: readonly string[];
}

/** Copy of harness-fs.service.ts:103-122, retained as a byte-equality oracle. */
function currentHarnessSkillContent(params: CurrentHarnessInput): string {
  const escapedName = params.name.replace(/"/g, '\\"');
  const escapedDesc = params.description
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
  const safeToolName = (t: string) => t.replace(/[^\w:/.\\-]/g, '');
  const toolsSection =
    params.allowedTools && params.allowedTools.length > 0
      ? `\nallowed_tools:\n${params.allowedTools.map((t) => `  - ${safeToolName(t)}`).join('\n')}`
      : '';

  return [
    '---',
    `name: "${escapedName}"`,
    `description: "${escapedDesc}"`,
    `source: custom${toolsSection}`,
    '---',
    '',
    params.content,
    '',
  ].join('\n');
}

describe('skillDocumentSlug', () => {
  it.each([
    ['My Skill', 'my-skill'],
    ['  Already---Slugged  ', 'already-slugged'],
    ['C++ / TypeScript', 'c-typescript'],
    ['---', ''],
    ['éclair', 'clair'],
    ['a_b.c', 'a-b-c'],
  ])('normalizes %p to %p', (name, expected) => {
    expect(skillDocumentSlug(name)).toBe(expected);
  });
});

describe('serializeSkillDocument', () => {
  const input = {
    name: 'My "Quoted" Skill',
    description: 'First line\nA "quoted" second line',
    body: '---\r\nname: body-owned\r\n---\r\n# Body\r\n',
  };

  it('is byte-equal to the current harness format without allowed_tools', () => {
    const expected = currentHarnessSkillContent({
      name: input.name,
      description: input.description,
      content: input.body,
    });

    const result = serializeSkillDocument(input);

    expect(result).toEqual({ slug: 'my-quoted-skill', content: expected });
    expect(serializeSkillDocument({ ...input, allowedTools: [] }).content).toBe(
      expected,
    );
  });

  it('is byte-equal to the current harness format with sanitized allowed_tools', () => {
    const allowedTools = [
      'Bash(npm test)*',
      'mcp:server/tool.v1\\path-item',
      'Read file',
    ];
    const expected = currentHarnessSkillContent({
      name: input.name,
      description: input.description,
      content: input.body,
      allowedTools,
    });

    expect(serializeSkillDocument({ ...input, allowedTools }).content).toBe(
      expected,
    );
    expect(expected).toContain(
      'allowed_tools:\n  - Bashnpmtest\n  - mcp:server/tool.v1\\path-item\n  - Readfile',
    );
  });

  it('escapes backslashes, quotes and line breaks in quoted frontmatter values', () => {
    const result = serializeSkillDocument({
      name: 'Skill\n"Name"\\',
      description: 'Path "C:\\path"\r\nEnds with \\',
      body: 'Body',
    });

    expect(result.content.split('\n').slice(1, 3)).toEqual([
      String.raw`name: "Skill\n\"Name\"\\"`,
      String.raw`description: "Path \"C:\\path\"\r\nEnds with \\"`,
    ]);
  });

  it('preserves delimiter-prefixed body verbatim with source: custom and sanitized allowed_tools', () => {
    const body = '---\nname: model-metadata\n---\n\n## Instructions\n';
    const result = serializeSkillDocument({
      name: 'Draft',
      description: 'Description',
      body,
      allowedTools: ['Read only'],
    });

    expect(result.content).toBe(
      '---\n' +
        'name: "Draft"\n' +
        'description: "Description"\n' +
        'source: custom\n' +
        'allowed_tools:\n' +
        '  - Readonly\n' +
        '---\n' +
        '\n' +
        body +
        '\n',
    );
    expect(result.content.endsWith(`${body}\n`)).toBe(true);
  });
});

describe('normalizeDraftBody', () => {
  it('strips at most one leading YAML block and preserves second block', () => {
    const raw =
      '---\r\n' +
      'name: generated\r\n' +
      'description: metadata\r\n' +
      '---\r\n' +
      '---\r\n' +
      'name: second-block\r\n' +
      '---\r\n' +
      '# Body\r\n';

    expect(normalizeDraftBody(raw)).toBe(
      '---\nname: second-block\n---\n# Body\n',
    );
  });

  it('strips at most one leading YAML block and preserves plain horizontal rule', () => {
    const horizontalRule = '---\nA plain rule, not YAML metadata\n---\n# Body\n';

    expect(normalizeDraftBody(horizontalRule)).toBe(horizontalRule);
    expect(normalizeDraftBody('---\n---\nBody')).toBe('---\n---\nBody');
    expect(normalizeDraftBody('---\nname:\n---\nBody')).toBe(
      '---\nname:\n---\nBody',
    );
  });

  it('normalizes CRLF without stripping non-frontmatter or later blocks', () => {
    expect(normalizeDraftBody('# Title\r\n\r\nBody\r\n')).toBe(
      '# Title\n\nBody\n',
    );
    expect(normalizeDraftBody('# Title\r\n---\r\nname: later\r\n---\r\n')).toBe(
      '# Title\n---\nname: later\n---\n',
    );
    expect(normalizeDraftBody(' ---\r\nname: indented\r\n---\r\nBody')).toBe(
      ' ---\nname: indented\n---\nBody',
    );
  });
});

describe('validateSkillDocument', () => {
  it.each([
    [{ name: '---', body: 'Body' }],
    [{ name: 'Valid name', body: ' \n\t ' }],
    [{ name: '!!!', body: '' }],
  ])('rejects invalid input %#', (input) => {
    expect(validateSkillDocument(input)).toBe(false);
  });

  it('accepts a nonempty slug and nonblank body', () => {
    expect(validateSkillDocument({ name: 'Valid name', body: ' Body ' })).toBe(
      true,
    );
  });
});
