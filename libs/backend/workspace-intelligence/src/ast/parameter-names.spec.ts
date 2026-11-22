/**
 * `extractParameterNames` (TASK_2026_2299): the names of a parameter list,
 * read past comments, decorators, modifiers, generics, destructuring and
 * default values.
 */
import { extractParameterNames } from './parameter-names';

describe('extractParameterNames', () => {
  it('reads a decorated, commented DI constructor (session-spawner shape)', () => {
    const text = `(
    @inject(SessionChildRegistry)
    private readonly registry: SessionChildRegistry,
    @inject(SDK_TOKENS.SDK_ADAPTER_EVENTS)
    adapterEvents: SdkAdapterEvents,
    private readonly cache: Map<string, Set<number>>,
    /** Absent in a host without a chat runtime, so the start is refused. */
    @inject(TOKENS.AGENT_ADAPTER, { isOptional: true })
    private readonly adapter: IAgentAdapter | null = null,
    /**
     * Where the host port is looked up, at \`start()\` time and never here:
     * a constructor injection would capture {null}, or "x", so it waits.
     */
    @inject(PLATFORM_TOKENS.DI_CONTAINER, { isOptional: true })
    private readonly container: DependencyContainer | null = null,
    // a line comment, with a comma
    @inject(TOKENS.LOGGER) logger: Logger,
  )`;
    expect(extractParameterNames(text, 'typescript')).toEqual([
      'registry',
      'adapterEvents',
      'cache',
      'adapter',
      'container',
      'logger',
    ]);
  });

  it.each([
    ['(a, b)', ['a', 'b']],
    ['()', []],
    ['(x?: number, ...rest: string[])', ['x', '...rest']],
    ['(this: Window, ev: Event)', ['ev']],
    ['({ a, b: renamed, ...others }: Props, [first, second]: T)', ['{a,b,...others}', '[first,second]']],
    [
      '({ alpha, beta, gamma, delta, epsilon, zeta, eta, theta }: Big)',
      ['{…}'],
    ],
    ["(sep = ', ', cb = (a, b) => a > b, n = 1)", ['sep', 'cb', 'n']],
    ['(fn: (x: A, y: B) => C, map: Record<K, V>)', ['fn', 'map']],
    ['(tpl = `a,${b}`, re = /,/)', ['tpl', 're']],
    ['(@Optional() @Inject(X) public x: X)', ['x']],
  ])('typescript %s → %j', (text, names) => {
    expect(extractParameterNames(text, 'typescript')).toEqual(names);
  });

  it.each([
    ['(self, a: int = 1, *args, **kwargs)', ['self', 'a', '*args', '**kwargs']],
    ['(a, /, b, *, c)', ['a', 'b', 'c']],
    ['(a, # comment, with comma\n b)', ['a', 'b']],
  ])('python %s → %j', (text, names) => {
    expect(extractParameterNames(text, 'python')).toEqual(names);
  });

  it.each([
    ['java', '(final @Nullable String name, Map<K, V> map, String... args)', ['name', 'map', '...args']],
    ['java', '(U first, int size)', ['first', 'size']],
    ['csharp', '(Func<Invoice, T> selector)', ['selector']],
    ['csharp', '(this Invoice i, decimal rate)', ['i', 'rate']],
    ['csharp', '([FromBody] Order order, params int[] ids, int n = 5)', ['order', 'ids', 'n']],
    ['cpp', '(const std::vector<int>& v, char **argv, int (*cb)(int), int)', ['v', 'argv', 'cb', 'int']],
    ['cpp', '(char buf[10], ...)', ['buf', '...']],
    ['php', '(string $label, int $size = 1, ...$rest)', ['$label', '$size', '...$rest']],
    ['php', '(#[Attr] private readonly Foo &$x)', ['$x']],
    ['kotlin', '(@Ann val name: String, vararg items: Int, width: Int = 2)', ['name', 'items', 'width']],
    ['rust', "(&self, mut x: i32, y: &'a str, (a, b): (i32, i32))", ['self', 'x', 'y', '(a,b)']],
    ['go', '(ctx context.Context, a, b int, args ...string)', ['ctx', 'a', 'b', 'args']],
    ['ruby', 'a, *rest, key:, &blk', ['a', '*rest', 'key', '&blk']],
  ] as const)('%s %s → %j', (language, text, names) => {
    expect(extractParameterNames(text, language)).toEqual(names);
  });
});
