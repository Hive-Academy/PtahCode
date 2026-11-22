/**
 * Class membership of TypeScript/JavaScript methods (TASK_2026_2299).
 *
 * The function query lists every `method_definition` beside the module
 * functions, object-literal methods included, and a capture keeps no parent
 * link. The class query therefore also captures each `method_definition`
 * that is a direct child of a `class_body` (`@class_member.declaration`),
 * together with that body's opening brace (`@class_member.open`; the brace,
 * not the body, so a large class is not copied once per member). A method
 * belongs to the captured class whose body opens at that brace. Membership is
 * exact: an object-literal method (in a field initialiser or a method body)
 * is not a class member, and a member of an uncaptured class (an anonymous
 * `class {}` argument) is attached to no class.
 */
import type {
  CodePosition,
  GenericAstNode,
  SupportedLanguage,
} from './ast.types';
import type { ClassInfo, FunctionInfo } from './ast-analysis.interfaces';
import type { QueryMatch } from './tree-sitter-parser.service';

/** Languages whose class query carries the `@class_member.*` captures. */
export const CLASS_MEMBER_LANGUAGES: ReadonlySet<SupportedLanguage> = new Set([
  'typescript',
  'javascript',
  'tsx',
]);

/** A captured class and the start of its `class_body`, when found. */
export interface ClassWithBody {
  readonly info: ClassInfo;
  readonly bodyStart?: CodePosition;
}

/** A `method_definition` capture of the function query. */
export interface MethodCapture {
  readonly info: FunctionInfo;
  readonly declaration: GenericAstNode;
}

/** Keyword tokens of a `method_definition` that are member modifiers. */
const KEYWORD_MODIFIERS = new Set(['static', 'get', 'set', 'async']);

/** Named nodes of a `method_definition` that are member modifiers. */
const NAMED_MODIFIERS = new Set([
  'accessibility_modifier',
  'override_modifier',
]);

/** Node types a captured class declaration node can have. */
const CLASS_NODES = new Set([
  'class_declaration',
  'abstract_class_declaration',
  'class',
]);

function positionKey(position: CodePosition): string {
  return `${position.row}:${position.column}`;
}

function contains(node: GenericAstNode, position: CodePosition): boolean {
  const { startPosition: start, endPosition: end } = node;
  const afterStart =
    position.row > start.row ||
    (position.row === start.row && position.column >= start.column);
  const beforeEnd =
    position.row < end.row ||
    (position.row === end.row && position.column <= end.column);
  return afterStart && beforeEnd;
}

/**
 * Modifiers of one `method_definition` node in source order: accessibility,
 * `static`, `override`, `async`, `get`/`set`; a `#name` adds `private`.
 * Empty when the method has none.
 */
export function methodModifiers(declaration: GenericAstNode): string {
  const modifiers: string[] = [];
  for (const child of declaration.children) {
    if (NAMED_MODIFIERS.has(child.type)) {
      modifiers.push(child.text.trim());
    } else if (!child.isNamed && KEYWORD_MODIFIERS.has(child.type)) {
      modifiers.push(child.type);
    } else if (child.type === 'private_property_identifier') {
      modifiers.push('private');
    }
  }
  return modifiers.join(' ');
}

/**
 * Start of the `class_body` of a captured class. `declaration` is the class
 * node itself, or the `lexical_declaration` of `const Name = class {}`, in
 * which case the declarator holding `namePosition` is the one read.
 */
export function classBodyStart(
  declaration: GenericAstNode,
  namePosition: CodePosition,
): CodePosition | undefined {
  let classNode: GenericAstNode | undefined;
  if (CLASS_NODES.has(declaration.type)) {
    classNode = declaration;
  } else {
    const declarator = declaration.children.find(
      (child) =>
        child.type === 'variable_declarator' && contains(child, namePosition),
    );
    classNode = declarator?.children.find((child) => child.type === 'class');
  }
  return classNode?.children.find((child) => child.type === 'class_body')
    ?.startPosition;
}

/**
 * Method start position (`row:column`) to the start of the class body that
 * directly holds it, from the `@class_member.*` captures of class matches.
 */
export function classMemberIndex(
  matches: readonly QueryMatch[],
): Map<string, string> {
  const index = new Map<string, string>();
  for (const match of matches) {
    const member = match.captures.find(
      (capture) => capture.name === 'class_member.declaration',
    );
    const open = match.captures.find(
      (capture) => capture.name === 'class_member.open',
    );
    if (member && open) {
      index.set(
        positionKey(member.startPosition),
        positionKey(open.startPosition),
      );
    }
  }
  return index;
}

/**
 * `classes` with `methods` set to their member methods in source order, each
 * with `modifiers` when it has any. A method no captured class holds is
 * attached to none.
 */
export function attachClassMembers(
  classes: readonly ClassWithBody[],
  methods: readonly MethodCapture[],
  memberIndex: ReadonlyMap<string, string>,
): ClassInfo[] {
  const byBody = new Map<string, FunctionInfo[]>();
  for (const { bodyStart } of classes) {
    if (bodyStart) {
      byBody.set(positionKey(bodyStart), []);
    }
  }
  for (const { info, declaration } of methods) {
    const body = memberIndex.get(positionKey(declaration.startPosition));
    const list = body === undefined ? undefined : byBody.get(body);
    if (!list) {
      continue;
    }
    const modifiers = methodModifiers(declaration);
    list.push(modifiers === '' ? { ...info } : { ...info, modifiers });
  }
  return classes.map(({ info, bodyStart }) => {
    const list = bodyStart ? byBody.get(positionKey(bodyStart)) : undefined;
    return list && list.length > 0 ? { ...info, methods: list } : info;
  });
}
