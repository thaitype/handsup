/**
 * Counts what reaches D1, using the metadata D1 returns. Better Auth's D1 dialect runs
 * statements with `all()` and `batch()`; anything else throws so no query goes uncounted.
 */
export type Query = { sql: string; rowsRead: number; rowsWritten: number };

export function countingD1(database: D1Database) {
  const queries: Query[] = [];
  const record = (sql: string, result: D1Result) => {
    queries.push({ sql, rowsRead: result.meta.rows_read, rowsWritten: result.meta.rows_written });
    return result;
  };
  const uncounted = (method: string) => () => {
    throw new Error(`D1 ${method}() is not counted; teach countingD1 about it`);
  };
  const originals = new WeakMap<object, { statement: D1PreparedStatement; sql: string }>();
  const wrap = (statement: D1PreparedStatement, sql: string): D1PreparedStatement => {
    const wrapped = {
      bind: (...values: unknown[]) => wrap(statement.bind(...values), sql),
      all: async () => record(sql, await statement.all()),
      run: async () => record(sql, await statement.run()),
      first: uncounted("first"),
      raw: uncounted("raw"),
    } as unknown as D1PreparedStatement;
    originals.set(wrapped, { statement, sql });
    return wrapped;
  };
  const counted = {
    prepare: (sql: string) => wrap(database.prepare(sql), sql),
    batch: async (statements: D1PreparedStatement[]) => {
      const entries = statements.map((s) => originals.get(s)!);
      const results = await database.batch(entries.map((e) => e.statement));
      return results.map((result, i) => record(entries[i]!.sql, result));
    },
    exec: uncounted("exec"),
  } as unknown as D1Database;
  return { database: counted, queries };
}
