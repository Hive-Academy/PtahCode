#!/usr/bin/env npx ts-node
/**
 * Validation Script for Orchestration Skill
 *
 * Validates the orchestration skill's markdown files for:
 * 1. Markdown syntax (all files parseable)
 * 2. Internal references (all links point to existing files)
 * 3. Content completeness (all 6 strategies, all 14 agents documented)
 * 4. Consistency (invocation patterns match agent-catalog)
 *
 * Run: npx ts-node scripts/validate-orchestration-skill.ts
 * Exit codes: 0 = success, 1 = validation failures found
 */

import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import * as ts from 'typescript';
import { PHASE_KINDS } from '../libs/shared/src/lib/types/phase-contract.types';

/**
 * Represents a validation error found during checks.
 */
interface ValidationError {
  /** Source file where the error was found */
  file: string;
  /** Error type category */
  type: 'syntax' | 'reference' | 'content' | 'consistency';
  /** Human-readable error message */
  message: string;
  /** Suggestion for fixing the error */
  suggestion: string;
  /** Line number where error occurred (optional) */
  line?: number;
}

/**
 * Represents the complete result of validation.
 */
interface ValidationResult {
  /** List of errors that must be fixed */
  errors: ValidationError[];
  /** List of warnings that should be reviewed */
  warnings: ValidationError[];
  /** Number of files checked */
  filesChecked: number;
  /** Whether validation passed (no errors) */
  passed: boolean;
}

/**
 * Represents an extracted markdown link.
 */
interface ExtractedLink {
  /** The link path */
  link: string;
  /** Line number where link appears */
  line: number;
}

/**
 * ANSI color codes for console output.
 */
interface ColorCodes {
  reset: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  cyan: string;
  bold: string;
}

/**
 * Section requirement for SKILL.md validation.
 */
interface RequiredSection {
  pattern: RegExp;
  name: string;
}

/** ANSI color codes for console output */
const colors: ColorCodes = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

/** Required strategies that must be documented */
const REQUIRED_STRATEGIES: readonly string[] = [
  'FEATURE',
  'BUGFIX',
  'REFACTORING',
  'DOCUMENTATION',
  'RESEARCH',
  'DEVOPS',
] as const;

/**
 * Required agents that must be documented (the 14 orchestration-roster agents).
 *
 * NOTE: this is the orchestration skill's roster, NOT the full agent-template
 * set. Standalone templates such as `sample-agent` are intentionally absent
 * here — they are not part of the /orchestrate workflow and must not be forced
 * into agent-catalog.md or the shipped agent templates by this validator.
 */
const REQUIRED_AGENTS: readonly string[] = [
  'project-manager',
  'software-architect',
  'team-leader',
  'backend-developer',
  'frontend-developer',
  'devops-engineer',
  'senior-tester',
  'code-style-reviewer',
  'code-logic-reviewer',
  'researcher-expert',
  'modernization-detector',
  'ui-ux-designer',
  'visual-reviewer',
  'technical-content-writer',
] as const;

/** Required sections in SKILL.md */
const SKILL_REQUIRED_SECTIONS: readonly RequiredSection[] = [
  { pattern: /##\s+Pre-flight/i, name: 'Pre-flight' },
  { pattern: /##\s+Task folder/i, name: 'Task folder' },
  { pattern: /##\s+Gates/i, name: 'Gates' },
  { pattern: /##\s+Invoking agents/i, name: 'Invoking agents' },
  { pattern: /##\s+References/i, name: 'References' },
] as const;

/** Required reference files */
const REQUIRED_REFERENCES: readonly string[] = [
  'strategies.md',
  'agent-catalog.md',
  'team-leader-modes.md',
  'task-tracking.md',
  'checkpoints.md',
  'git-standards.md',
  'lane-assignment.md',
  'fleet.md',
] as const;

/** Target line count for SKILL.md */
const TARGET_SKILL_LINES = 300;
const SKILL_ROOT: string = path.join(
  process.cwd(),
  'plugins',
  'ptah-core',
  'skills',
  'orchestration',
);
const AGENTS_DIR: string = path.join(
  process.cwd(),
  'libs',
  'backend',
  'agent-generation',
  'templates',
  'agents',
);
const LANE_SKILL_FILE = path.join(
  path.dirname(SKILL_ROOT),
  'agent-lanes',
  'SKILL.md',
);
const TEAM_LEADER_TEMPLATE = path.join(AGENTS_DIR, 'team-leader.template.md');
const REFERENCES_DIR: string = path.join(SKILL_ROOT, 'references');
const MIRROR_ROOT = path.join(process.cwd(), '.claude', 'skills', 'orchestration');
const PHASE_HEADINGS = [
  'Method', 'Output contract', 'Return value', 'Refusals', 'Escalation protocol',
] as const;
const REVIEW_KINDS: readonly string[] = ['review', 'document-review', 'visual-review'];

function error(file: string, message: string): ValidationError {
  return { file, type: 'content', message, suggestion: 'Correct the orchestration skill contract' };
}

function listFiles(root: string, errors: ValidationError[] = [], relativeRoot = ''): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const absolute = path.join(root, entry.name);
    const relative = path.join(relativeRoot, entry.name).replace(/\\/g, '/');
    if (entry.isSymbolicLink()) {
      errors.push(error(relative, `Symbolic link in skill copy: ${relative}`));
      return [];
    }
    if (entry.isDirectory()) return listFiles(absolute, errors, relative).map(file => path.join(entry.name, file));
    return entry.isFile() ? [entry.name] : [];
  });
}

function validateMirror(): ValidationError[] {
  const errors: ValidationError[] = [];
  const pluginFiles = new Set(listFiles(SKILL_ROOT, errors));
  const mirrorFiles = new Set(listFiles(MIRROR_ROOT, errors));
  for (const relative of new Set([...pluginFiles, ...mirrorFiles])) {
    if (!pluginFiles.has(relative) || !mirrorFiles.has(relative)) {
      errors.push(error(relative, `Mirror file missing: ${relative} in ${pluginFiles.has(relative) ? '.claude' : 'plugin'} copy`));
    } else if (!fs.readFileSync(path.join(SKILL_ROOT, relative)).equals(fs.readFileSync(path.join(MIRROR_ROOT, relative)))) {
      errors.push(error(relative, `Mirror bytes differ: ${relative}`));
    }
  }
  return errors;
}

function retiredRoles(): string[] {
  const sourcePath = path.join(process.cwd(), 'tools', 'role-census', 'check-role-census.ts');
  const source = ts.createSourceFile(sourcePath, fs.readFileSync(sourcePath, 'utf8'), ts.ScriptTarget.Latest, true);
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== 'ROLES' || !declaration.initializer || !ts.isArrayLiteralExpression(declaration.initializer)) continue;
      const roles = declaration.initializer.elements;
      if (!roles.length || !roles.every(ts.isStringLiteral)) throw new Error('Role census ROLES must contain string literals');
      return roles.map(role => (role as ts.StringLiteral).text);
    }
  }
  throw new Error('Role census ROLES list was not found');
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

// Keep heading rules aligned with libs/backend/lane-routing/src/lib/contracts/phase-definition-resolver.ts.
function maskFences(body: string): string {
  let fence: { marker: string; length: number } | undefined;
  return body.replace(/^.*(?:\n|$)/gm, line => {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (!fence && marker) fence = { marker: marker.charAt(0), length: marker.length };
    else if (fence && marker?.charAt(0) === fence.marker && marker.length >= fence.length) fence = undefined;
    return fence || marker ? line.replace(/[^\r\n]/g, ' ') : line;
  });
}

function validatePhase(file: string, roles: readonly string[]): ValidationError[] {
  const relative = path.relative(SKILL_ROOT, file).replace(/\\/g, '/');
  const content = fs.readFileSync(file, 'utf8');
  const errors: ValidationError[] = [];
  let data: Record<string, unknown> | undefined;
  try {
    data = record(matter(content, { language: 'yaml' }).data);
  } catch (caught: unknown) {
    return [error(relative, `Invalid phase YAML: ${caught instanceof Error ? caught.message : String(caught)}`)];
  }
  if (!content.startsWith('---')) errors.push(error(relative, 'Missing phase YAML frontmatter'));
  const topKeys = ['version', 'kind', 'input', 'deliverable', 'verdict', 'acceptanceStep', 'requiredCapabilities', 'toolProfile'];
  for (const key of Object.keys(data ?? {})) if (!topKeys.includes(key)) errors.push(error(relative, `Unknown phase field: ${key}`));
  if (data?.version !== 1) errors.push(error(relative, 'Invalid phase field: version must be 1'));
  const kind = path.basename(file, '.md');
  if (!PHASE_KINDS.includes(kind as typeof PHASE_KINDS[number]) || data?.kind !== kind) errors.push(error(relative, `Invalid phase field: kind must equal filename ${kind}`));
  for (const field of ['input', 'deliverable', 'verdict', 'acceptanceStep', 'requiredCapabilities'] as const) {
    if (!Array.isArray(data?.[field]) || !data[field].length || !data[field].every(value => typeof value === 'string' && value.trim())) errors.push(error(relative, `Invalid phase field: ${field} must be a nonempty list of nonempty strings`));
  }
  const profile = record(data?.toolProfile);
  for (const key of Object.keys(profile ?? {})) if (!['disallowedTools', 'permission'].includes(key)) errors.push(error(relative, `Unknown toolProfile field: ${key}`));
  if (!profile || !Array.isArray(profile.disallowedTools) || !profile.disallowedTools.every(value => typeof value === 'string' && value.trim()) || !['allow', 'deny', 'prompt'].includes(String(profile.permission))) errors.push(error(relative, 'Invalid phase field: toolProfile requires disallowedTools and permission allow|deny|prompt'));
  const body = matter(content, { language: 'yaml' }).content;
  const matches = [...maskFences(body).matchAll(/^## ([^\r\n]+)\r?$/gm)];
  const sections = new Map<string, string[]>();
  for (let index = 0; index < matches.length; index++) {
    const match = matches[index];
    if (!match) continue;
    const heading = match[1]?.trim();
    if (!heading) continue;
    if (![...PHASE_HEADINGS, 'Reviewer stance'].includes(heading)) continue;
    const start = match.index! + match[0].length;
    sections.set(heading, [...(sections.get(heading) ?? []), body.slice(start, matches[index + 1]?.index ?? body.length).trim()]);
  }
  for (const heading of [...PHASE_HEADINGS, ...(REVIEW_KINDS.includes(kind) ? ['Reviewer stance'] : [])]) {
    if (!sections.get(heading)?.[0]) errors.push(error(relative, `Missing or empty phase section: ${heading}`));
  }
  for (const [heading, values] of sections) if (values.length > 1) errors.push(error(relative, `Duplicate phase section: ${heading}`));
  if (!REVIEW_KINDS.includes(kind) && sections.has('Reviewer stance')) errors.push(error(relative, 'Unexpected phase section: Reviewer stance'));
  for (const role of roles) if (content.includes(role)) errors.push(error(relative, `Retired role name in phase definition: ${role}`));
  return errors;
}

function validatePhases(): ValidationError[] {
  const directory = path.join(SKILL_ROOT, 'phases');
  const files = fs.existsSync(directory) ? fs.readdirSync(directory).filter(name => name.endsWith('.md')) : [];
  const roles = retiredRoles();
  const errors = files.flatMap(name => validatePhase(path.join(directory, name), roles));
  const skill = fs.readFileSync(path.join(SKILL_ROOT, 'SKILL.md'), 'utf8');
  const active = /^## Phase-kind flows\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(maskFences(skill));
  if (active) {
    const expected = new Set(PHASE_KINDS.map(kind => `${kind}.md`));
    for (const name of expected) if (!files.includes(name)) errors.push(error(`phases/${name}`, `Required phase file missing: ${name}`));
    for (const name of files) if (!expected.has(name)) errors.push(error(`phases/${name}`, `Unexpected phase file: ${name}`));
    // The mask keeps the string length, so the offsets of the masked match are valid in the original text.
    const flow = skill.slice(active.index, active.index + active[0].length);
    for (const role of roles) if (flow.includes(role)) errors.push(error('SKILL.md', `Retired role name in active phase flow: ${role}`));
  }
  return errors;
}

/**
 * Logs a colored message to console.
 * @param color - Color key from colors object
 * @param message - Message to log
 */
function log(color: keyof ColorCodes, message: string): void {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Logs an error with formatting.
 * @param error - Validation error to log
 */
function logError(error: ValidationError): void {
  const lineInfo = error.line ? `:${error.line}` : '';
  console.log(
    `  ${colors.red}[${error.type.toUpperCase()}]${colors.reset} ${
      error.file
    }${lineInfo}`,
  );
  console.log(`    ${colors.yellow}Message:${colors.reset} ${error.message}`);
  console.log(
    `    ${colors.cyan}Suggestion:${colors.reset} ${error.suggestion}`,
  );
}

/**
 * Logs a warning with formatting.
 * @param warning - Validation warning to log
 */
function logWarning(warning: ValidationError): void {
  const lineInfo = warning.line ? `:${warning.line}` : '';
  console.log(
    `  ${colors.yellow}[WARNING]${colors.reset} ${warning.file}${lineInfo}`,
  );
  console.log(`    ${colors.yellow}Message:${colors.reset} ${warning.message}`);
  console.log(
    `    ${colors.cyan}Suggestion:${colors.reset} ${warning.suggestion}`,
  );
}

/**
 * Gets all markdown files in the skill directory recursively.
 * @returns Array of absolute file paths to markdown files
 */
function getSkillMarkdownFiles(): string[] {
  const files: string[] = [];

  function scanDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      return;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  }

  scanDir(SKILL_ROOT);
  return files;
}

/**
 * Validates markdown syntax by checking for common issues.
 * @param filePath - Path to the file being validated
 * @param content - File content
 * @returns Array of syntax validation errors
 */
function validateMarkdownSyntax(
  filePath: string,
  content: string,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const lines = content.split('\n');
  let depth3 = 0;
  let depth4 = 0;
  let lastCodeBlockLine = 0;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('````')) {
      depth4 = depth4 === 0 ? 1 : 0;
      lastCodeBlockLine = index + 1;
    } else if (trimmed.startsWith('```') && depth4 === 0) {
      depth3 = depth3 === 0 ? 1 : 0;
      lastCodeBlockLine = index + 1;
    }
  });

  if (depth3 !== 0 || depth4 !== 0) {
    errors.push({
      file: path.relative(process.cwd(), filePath),
      type: 'syntax',
      message: 'Unclosed code block detected',
      suggestion: `Check code block near line ${lastCodeBlockLine} - ensure it has a closing \`\`\``,
      line: lastCodeBlockLine,
    });
  }
  lines.forEach((line, index) => {
    if (/^#{1,6}[^#\s]/.test(line)) {
      errors.push({
        file: path.relative(process.cwd(), filePath),
        type: 'syntax',
        message: 'Heading missing space after # symbols',
        suggestion: 'Add a space between # symbols and heading text',
        line: index + 1,
      });
    }
  });
  if (content.trim().length === 0) {
    errors.push({
      file: path.relative(process.cwd(), filePath),
      type: 'syntax',
      message: 'File is empty',
      suggestion: 'Add content to the file or remove it if not needed',
    });
  }

  return errors;
}

/**
 * Extracts markdown links from content.
 * @param content - File content to extract links from
 * @returns Array of extracted links with line numbers
 */
function extractMarkdownLinks(content: string): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  const lines = content.split('\n');
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

  lines.forEach((line, index) => {
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(line)) !== null) {
      const link = match[2];
      if (
        link !== undefined &&
        !link.startsWith('http://') &&
        !link.startsWith('https://')
      ) {
        links.push({ link, line: index + 1 });
      }
    }
  });

  return links;
}

/**
 * Validates internal references point to existing files.
 * @param filePath - Path to the file being validated
 * @param content - File content
 * @returns Array of reference validation errors
 */
function validateInternalReferences(
  filePath: string,
  content: string,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const links = extractMarkdownLinks(maskFences(content));
  const fileDir = path.dirname(filePath);

  for (const { link, line } of links) {
    const [linkPath, anchor] = link.split('#');
    const resolvedPath = linkPath ? path.resolve(fileDir, linkPath) : filePath;

    if (!fs.existsSync(resolvedPath)) {
      errors.push({
        file: path.relative(process.cwd(), filePath),
        type: 'reference',
        message: `Broken link: "${link}" - file does not exist`,
        suggestion: `Check if the file path is correct. Expected: ${path.relative(
          process.cwd(),
          resolvedPath,
        )}`,
        line,
      });
    } else if (anchor && fs.statSync(resolvedPath).isFile()) {
      const target = maskFences(fs.readFileSync(resolvedPath, 'utf8'));
      const slugs = [...target.matchAll(/^#{1,6}\s+(.+)$/gm)].map(match =>
        (match[1] ?? '').trim().toLowerCase().replace(/[`*_~]/g, '').replace(/[^\p{L}\p{N} -]/gu, '').replace(/ /g, '-'),
      );
      if (!slugs.includes(decodeURIComponent(anchor).toLowerCase())) {
        errors.push(error(filePath, `Broken heading anchor: ${link}`));
      }
    }
  }

  return errors;
}

/**
 * Validates all required strategies are documented.
 * @param strategiesFile - Path to strategies.md
 * @param content - File content
 * @returns Array of content validation errors
 */
function validateStrategiesDocumented(
  strategiesFile: string,
  content: string,
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const strategy of REQUIRED_STRATEGIES) {
    const headingPattern = new RegExp(`##\\s+${strategy}`, 'i');
    if (!headingPattern.test(content)) {
      errors.push({
        file: path.relative(process.cwd(), strategiesFile),
        type: 'content',
        message: `Missing strategy documentation: ${strategy}`,
        suggestion: `Add a section "## ${strategy}" with workflow details`,
      });
    }
  }

  return errors;
}

/**
 * Validates all required agents are documented in agent-catalog.
 * @param catalogFile - Path to agent-catalog.md
 * @param content - File content
 * @returns Array of content validation errors
 */
function validateAgentsDocumented(
  catalogFile: string,
  content: string,
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const agent of REQUIRED_AGENTS) {
    // Each agent is documented as a row in the catalog tables (Profiles).
    const rowPattern = new RegExp(`^\\|\\s*${agent}\\s*\\|`, 'im');
    if (!rowPattern.test(content)) {
      errors.push({
        file: path.relative(process.cwd(), catalogFile),
        type: 'content',
        message: `Missing agent documentation: ${agent}`,
        suggestion: `Add a "| ${agent} |" row to the Profiles table with when it is invoked, what it reads and what runs alongside it`,
      });
    }
  }

  return errors;
}

/**
 * Validates that every orchestration agent has a shipped template.
 * @returns Array of content validation errors
 */
function validateAgentFilesExist(): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const agent of REQUIRED_AGENTS) {
    const agentFile = path.join(AGENTS_DIR, `${agent}.template.md`);

    if (!fs.existsSync(agentFile)) {
      errors.push({
        file: path.relative(process.cwd(), agentFile),
        type: 'content',
        message: `Agent template missing: ${agent}.template.md`,
        suggestion: `Create agent template at ${path.relative(process.cwd(), agentFile)}`,
      });
    }
  }

  return errors;
}

/**
 * Validates SKILL.md has required sections.
 * @param skillFile - Path to SKILL.md
 * @param content - File content
 * @returns Array of content validation errors
 */
function validateSkillStructure(
  skillFile: string,
  content: string,
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const section of SKILL_REQUIRED_SECTIONS) {
    if (!section.pattern.test(content)) {
      errors.push({
        file: path.relative(process.cwd(), skillFile),
        type: 'content',
        message: `Missing required section: ${section.name}`,
        suggestion: `Add section "## ${section.name}" to SKILL.md`,
      });
    }
  }

  return errors;
}

/**
 * Validates invocation patterns in agent-catalog match actual agent names.
 * @param catalogFile - Path to agent-catalog.md
 * @param content - File content
 * @returns Array of consistency validation errors
 */
function validateInvocationPatterns(
  catalogFile: string,
  content: string,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const subagentPattern = /subagent_type:\s*['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;

  while ((match = subagentPattern.exec(content)) !== null) {
    const agentName = match[1];

    // `<agent>` in the shared invocation template is a placeholder.
    const isPlaceholder = agentName !== undefined && /^<.+>$/.test(agentName);
    if (
      agentName !== undefined &&
      !isPlaceholder &&
      !REQUIRED_AGENTS.includes(agentName)
    ) {
      errors.push({
        file: path.relative(process.cwd(), catalogFile),
        type: 'consistency',
        message: `Unknown agent in invocation pattern: "${agentName}"`,
        suggestion: `Check if agent name is correct. Valid agents: ${REQUIRED_AGENTS.join(
          ', ',
        )}`,
      });
    }
  }

  return errors;
}

/**
 * Validates reference files exist.
 * @returns Array of content validation errors
 */
function validateReferenceFilesExist(): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const refFile of REQUIRED_REFERENCES) {
    const refPath = path.join(REFERENCES_DIR, refFile);

    if (!fs.existsSync(refPath)) {
      errors.push({
        file: path.relative(process.cwd(), refPath),
        type: 'content',
        message: `Required reference file missing: ${refFile}`,
        suggestion: `Create reference file at ${path.relative(process.cwd(), refPath)}`,
      });
    }
  }

  return errors;
}

/**
 * Validates SKILL.md line count is under target.
 * @param skillFile - Path to SKILL.md
 * @param content - File content
 * @returns Array of validation warnings
 */
function validateSkillLineCount(
  skillFile: string,
  content: string,
): ValidationError[] {
  const warnings: ValidationError[] = [];
  const lineCount = content.split('\n').length;

  if (lineCount > TARGET_SKILL_LINES) {
    warnings.push({
      file: path.relative(process.cwd(), skillFile),
      type: 'content',
      message: `SKILL.md is ${lineCount} lines (target: <${TARGET_SKILL_LINES})`,
      suggestion: 'Consider moving detailed content to reference files',
    });
  }

  return warnings;
}

/** Checks ordered policy markers only inside the named Markdown section. */
function validateRuleMarkers(
  filePath: string,
  section: string,
  markers: readonly string[],
  stopAtNextBoldBullet = false,
): ValidationError[] {
  const file = path.relative(process.cwd(), filePath);
  if (!fs.existsSync(filePath)) {
    // The required-file checks report missing references and agent templates.
    return filePath === LANE_SKILL_FILE
      ? [
          {
            file,
            type: 'content',
            message: 'Agent-lanes skill missing',
            suggestion: `Create ${file}`,
          },
        ]
      : [];
  }

  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
  const start = lines.findIndex((line) => {
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line.trim());
    return heading?.[2]?.toLowerCase() === section.toLowerCase();
  });
  if (start < 0) {
    return [
      {
        file,
        type: 'content',
        message: `Missing policy section: ${section}`,
        suggestion: `Add the ${section} section`,
      },
    ];
  }

  const level = /^(#+)/.exec((lines[start] ?? '').trim())?.[1]?.length ?? 6;
  let end = lines.length;
  let inFence = false;
  for (let index = start + 1; index < lines.length; index++) {
    const line = (lines[index] ?? '').trim();
    if (/^(?:`{3,}|~{3,})/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const next = /^(#{1,6})\s+/.exec(line);
    if (next?.[1] && next[1].length <= level) {
      end = index;
      break;
    }
  }

  let sectionContent = lines.slice(start + 1, end).join('\n');
  if (stopAtNextBoldBullet) {
    const first = sectionContent.indexOf(markers[0] ?? '');
    const next = sectionContent.indexOf(
      '\n- **',
      first + (markers[0]?.length ?? 0),
    );
    if (first >= 0 && next >= 0) sectionContent = sectionContent.slice(0, next);
  }
  const content = sectionContent.replace(/\s+/g, ' ');
  const errors: ValidationError[] = [];
  let cursor = 0;
  for (const marker of markers) {
    const found = content.indexOf(marker, cursor);
    if (found < 0) {
      errors.push({
        file,
        type: 'content',
        message: `Missing or out-of-order policy marker in ${section}: ${marker}`,
        suggestion: `Place "${marker}" in ${section}, after the preceding required marker`,
        line: start + 1,
      });
    } else {
      cursor = found + marker.length;
    }
  }
  return errors;
}

/** Validates the lanes-first rules in the shipped plugin and team-leader template. */
function validateLanesFirstRules(): ValidationError[] {
  const checkpoints = path.join(REFERENCES_DIR, 'checkpoints.md');
  const assignment = path.join(REFERENCES_DIR, 'lane-assignment.md');
  const fleet = path.join(REFERENCES_DIR, 'fleet.md');
  const gitStandards = path.join(REFERENCES_DIR, 'git-standards.md');
  return [
    ...validateRuleMarkers(checkpoints, 'Checkpoint 0.1: CLI Lane Mode', [
      'ptah_memory_search',
      'no recorded preference | `enabled`',
      'No spawnable lane',
      '`disabled`',
    ]),
    ...validateRuleMarkers(checkpoints, 'Checkpoint 0.1: CLI Lane Mode', [
      '"use lanes more"',
      '`lane-review` with a spawnable lane, unless "gate me"',
    ]),
    ...validateRuleMarkers(checkpoints, 'Approval mode', [
      'Escalate to the user',
      'REVISE',
      'same-side',
      'removal',
    ]),
    ...validateRuleMarkers(assignment, 'Batches on lanes', [
      'CLI lane',
      'Subagent reason',
    ]),
    ...validateRuleMarkers(TEAM_LEADER_TEMPLATE, 'Mode 1 — Decomposition', [
      'Recommended executor: CLI lane',
      'Subagent reason:',
    ]),
    ...validateRuleMarkers(TEAM_LEADER_TEMPLATE, 'Batch', [
      'Recommend `CLI lane` for every bounded batch by default',
      'Put that reason in `Subagent reason`',
    ]),
    ...validateRuleMarkers(LANE_SKILL_FILE, '4. Run', [
      'one `<agent-lane-completed>` signal per lane turn',
      'queued',
      'later signal',
      'supersedes',
      'pending',
    ]),
    ...validateRuleMarkers(LANE_SKILL_FILE, '4. Run', [
      'push is unavailable',
      'make one status/read check',
      'at most 5 status checks per lane',
      'at least 60 s apart',
      'fifth check',
    ]),
    ...validateRuleMarkers(LANE_SKILL_FILE, '5. Recover', [
      'AT LIMIT',
      'reset unknown',
    ]),
    ...validateRuleMarkers(LANE_SKILL_FILE, '5. Recover', [
      'other family same capability',
      'same family other provider/model',
      'subagent',
    ]),
    ...validateRuleMarkers(LANE_SKILL_FILE, '5. Recover', [
      'reset unknown',
      'skip',
    ]),
    ...validateRuleMarkers(LANE_SKILL_FILE, '6. Verify and revise', [
      '**Document gates',
      '**Shipping code',
    ]),
    ...validateRuleMarkers(
      LANE_SKILL_FILE,
      '6. Verify and revise',
      [
        '**Shipping code',
        'different family',
        'specific reason',
        'weaker-evidence label',
      ],
      true,
    ),
    ...validateRuleMarkers(LANE_SKILL_FILE, '6. Verify and revise', [
      'same-side',
      'REVISE at the cap',
      'removal',
      'user',
    ]),
    ...validateRuleMarkers(fleet, 'Disjoint batching', [
      'At most 6 files across at most 2 libraries/projects per batch, with one scoped verification command',
    ]),
    ...validateRuleMarkers(fleet, 'Checkpoints', [
      'taskId',
      'round',
      'pass',
      'defects',
      'testsRan',
      'mentorNote',
    ]),
    ...validateRuleMarkers(gitStandards, 'Destructive operations', [
      'Ask first',
      'git reset --hard',
      'git clean -fd',
      'git checkout .',
      'git restore .',
      'git branch -D',
      'git push --force',
      'git rebase',
      'git stash drop',
      'git stash clear',
    ]),
  ];
}

/**
 * Main validation function that orchestrates all checks.
 * @returns Complete validation result
 */
function validateOrchestrationSkill(): ValidationResult {
  const result: ValidationResult = {
    errors: [],
    warnings: [],
    filesChecked: 0,
    passed: true,
  };

  log('bold', '\n========================================');
  log('bold', '  Orchestration Skill Validation');
  log('bold', '========================================\n');
  if (!fs.existsSync(SKILL_ROOT)) {
    result.errors.push({
      file: SKILL_ROOT,
      type: 'content',
      message: 'Skill directory does not exist',
      suggestion: `Create ${path.relative(process.cwd(), SKILL_ROOT)} with SKILL.md`,
    });
    result.passed = false;
    return result;
  }
  const files = getSkillMarkdownFiles();
  result.filesChecked = files.length;

  log('cyan', `Found ${files.length} markdown files to validate\n`);
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const syntaxErrors = validateMarkdownSyntax(file, content);
    result.errors.push(...syntaxErrors);
    const refErrors = validateInternalReferences(file, content);
    result.errors.push(...refErrors);
    const fileName = path.basename(file);

    if (fileName === 'SKILL.md') {
      result.errors.push(...validateSkillStructure(file, content));
      result.warnings.push(...validateSkillLineCount(file, content));
    }

    if (fileName === 'strategies.md') {
      result.errors.push(...validateStrategiesDocumented(file, content));
    }

    if (fileName === 'agent-catalog.md') {
      result.errors.push(...validateAgentsDocumented(file, content));
      result.errors.push(...validateInvocationPatterns(file, content));
    }
  }
  result.errors.push(...validateAgentFilesExist());
  result.errors.push(...validateReferenceFilesExist());
  result.errors.push(...validateLanesFirstRules());
  result.errors.push(...validateMirror());
  result.errors.push(...validatePhases());
  result.passed = result.errors.length === 0;

  return result;
}

/**
 * Prints validation summary and results.
 * @param result - Validation result to print
 */
function printResults(result: ValidationResult): void {
  if (result.errors.length > 0) {
    log(
      'red',
      `\n${colors.bold}ERRORS (${result.errors.length}):${colors.reset}`,
    );
    for (const error of result.errors) {
      logError(error);
      console.log('');
    }
  }
  if (result.warnings.length > 0) {
    log(
      'yellow',
      `\n${colors.bold}WARNINGS (${result.warnings.length}):${colors.reset}`,
    );
    for (const warning of result.warnings) {
      logWarning(warning);
      console.log('');
    }
  }
  log('bold', '\n========================================');
  log('bold', '  Validation Summary');
  log('bold', '========================================');

  console.log(`  Files checked: ${result.filesChecked}`);
  console.log(`  Errors: ${colors.red}${result.errors.length}${colors.reset}`);
  console.log(
    `  Warnings: ${colors.yellow}${result.warnings.length}${colors.reset}`,
  );
  console.log('');

  if (result.passed) {
    log('green', `${colors.bold}  VALIDATION PASSED${colors.reset}`);
  } else {
    log('red', `${colors.bold}  VALIDATION FAILED${colors.reset}`);
  }

  console.log('');
}
const result = validateOrchestrationSkill();
printResults(result);
process.exit(result.passed ? 0 : 1);
