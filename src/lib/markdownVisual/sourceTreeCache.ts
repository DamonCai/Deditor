/** Reuse only the immutable parser output during overlapping editor startup.
 * Each consumer owns a clone: editing transforms must never mutate a cache hit. */
export class SourceTreeCache<T> {
  private readers = 0;
  private trees = new Map<string, T>();
  private units = 0;

  async during<R>(operation: () => Promise<R>): Promise<R> {
    ++this.readers;
    try { return await operation(); }
    finally {
      if (--this.readers === 0) {
        this.trees.clear();
        this.units = 0;
      }
    }
  }

  seed(source: string, tree: T) {
    if (!this.readers || source.length < 48 * 1024 || source.length > 256 * 1024 || this.trees.has(source)) return;
    while (this.trees.size >= 2 || this.units + source.length > 512 * 1024) {
      const oldest = this.trees.keys().next().value;
      if (oldest === undefined) break;
      this.units -= oldest.length;
      this.trees.delete(oldest);
    }
    this.trees.set(source, tree);
    this.units += source.length;
  }

  read(source: string, parse: () => T): T {
    // Small fragments are cheap and must not displace the whole document.
    // Bound transient storage to two sources of at most 256 Ki UTF-16 units.
    if (!this.readers || source.length < 48 * 1024 || source.length > 256 * 1024
      || typeof structuredClone !== "function") return parse();
    let tree = this.trees.get(source);
    if (tree === undefined) {
      tree = parse();
      this.seed(source, tree);
    }
    try { return structuredClone(tree); }
    catch {
      // Non-cloneable future parser extensions keep the ordinary parser path.
      this.trees.delete(source);
      this.units -= source.length;
      return parse();
    }
  }
}
