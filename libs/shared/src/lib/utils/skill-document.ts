export interface SerializeSkillDocumentInput {
  readonly name: string;
  readonly description: string;
  readonly body: string;
  readonly allowedTools?: readonly string[];
}

export interface SerializedSkillDocument {
  readonly slug: string;
  readonly content: string;
}

/** Derive the same skill directory slug as HarnessFsService.createSkillPlugin. */
export function skillDocumentSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Serialize a SKILL.md document without changing the supplied body.
 * Draft frontmatter normalization belongs to normalizeDraftBody, not this writer.
 */
export function serializeSkillDocument(
  input: SerializeSkillDocumentInput,
): SerializedSkillDocument {
  const escapedName = input.name.replace(/"/g, '\\"');
  const escapedDescription = input.description
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
  const safeToolName = (tool: string) => tool.replace(/[^\w:/.\\-]/g, '');
  const toolsSection =
    input.allowedTools && input.allowedTools.length > 0
      ? `\nallowed_tools:\n${input.allowedTools.map((tool) => `  - ${safeToolName(tool)}`).join('\n')}`
      : '';

  const content = [
    '---',
    `name: "${escapedName}"`,
    `description: "${escapedDescription}"`,
    `source: custom${toolsSection}`,
    '---',
    '',
    input.body,
    '',
  ].join('\n');

  return { slug: skillDocumentSlug(input.name), content };
}

/**
 * Normalize an untrusted AI draft body once before preview or serialization.
 * Only a leading frontmatter block with a YAML key/value line is removed.
 */
export function normalizeDraftBody(rawBody: string): string {
  const body = rawBody.replace(/\r\n/g, '\n');
  const frontmatter = /^---\n([\s\S]*?)\n---\n?/.exec(body);
  if (!frontmatter || !/^[A-Za-z_][A-Za-z0-9_-]*:[ \t]*\S.*$/m.test(frontmatter[1])) {
    return body;
  }
  return body.slice(frontmatter[0].length);
}

/** Return whether a document has a usable slug and a nonblank body. */
export function validateSkillDocument(input: {
  readonly name: string;
  readonly body: string;
}): boolean {
  return skillDocumentSlug(input.name).length > 0 && input.body.trim().length > 0;
}
