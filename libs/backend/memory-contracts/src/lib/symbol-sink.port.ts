export interface SymbolChunkInsert {
  /** Normalized: "code:<kind>:<absoluteFilePath>:<symbolName>" */
  readonly subject: string;
  /**
   * The symbol's kind and name as stored. The subject cannot carry a name
   * that holds a `:` unambiguously (its last `:` separates the name from the
   * path), so a producer that knows both sets them and the sink stores them
   * as given; when absent the sink parses them out of `subject`.
   */
  readonly kind?: string;
  readonly symbolName?: string;
  /** Chunk text for embedding: "<kind> <name> in <relPath>:<startLine>-<endLine>" */
  readonly text: string;
  readonly tokenCount: number;
  readonly filePath: string;
  readonly workspaceRoot: string;
}

export interface ISymbolSink {
  /** Remove symbols belonging to workspace roots that no longer exist. */
  purgeStaleRoots?(signal?: AbortSignal): Promise<{ roots: number; rows: number }>;
  /**
   * Delete all symbol chunks for a given file + workspace before re-indexing.
   * Returns count of deleted memory rows.
   */
  deleteSymbolsForFile(filePath: string, workspaceRoot: string): number;

  /**
   * Insert a batch of symbol chunks as memory entries (kind='entity', tier='archival').
   * Each chunk becomes a separate memory row with a single chunk.
   */
  insertSymbols(chunks: readonly SymbolChunkInsert[]): Promise<void>;

  /**
   * Replace one file's symbol rows. A persisting implementation does the
   * delete and the insert in one transaction, so a failed insert keeps the
   * previous rows. The indexer calls this, not delete-then-insert.
   *
   * `fingerprint` is the indexer's file fingerprint WITHOUT the embedder
   * model id; the store appends the model id. A string records the file as
   * indexed under that fingerprint when vec is unavailable or every row
   * got its vector. `null` or omitted deletes the file's record.
   */
  replaceFileSymbols(
    workspaceRoot: string,
    filePath: string,
    chunks: readonly SymbolChunkInsert[],
    fingerprint?: string | null,
  ): Promise<void>;

  /**
   * Whether the file's record matches `candidate`, the indexer's fingerprint
   * WITHOUT the embedder model id (the store appends it). `false` when the
   * record is missing, differs, or the vector index is not usable.
   */
  isFileUnchanged?(
    workspaceRoot: string,
    filePath: string,
    candidate: string,
  ): boolean;

  /** Record that a complete indexing pass confirmed `workspaceRoot` now. */
  markRootValidated?(workspaceRoot: string): void;

  /**
   * Delete symbol rows for `workspaceRoot` whose file path is not in
   * `presentPaths`. Other workspace roots are left untouched. Returns the
   * number of symbol rows deleted. The indexer calls this only after a
   * complete, non-aborted discovery.
   */
  purgeMissing(workspaceRoot: string, presentPaths: readonly string[]): number;
}
