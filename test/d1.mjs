// Minimal transactional D1 adapter over Node's built-in SQLite, for local use.
export function sqliteBinding(db, fail = () => false) {
  return {
    prepare(sql) {
      if (fail(sql)) throw new Error('Tracking unavailable');
      return {bind(...args) {
        const statement = db.prepare(sql);
        const run = () => ({meta: {changes: statement.run(...args).changes}});
        return {sql, _run: run, async run() { return run(); },
          async first() { return statement.get(...args) || null; },
          async all() { return {results: statement.all(...args)}; }};
      }};
    },
    async batch(statements) {
      db.exec('BEGIN');
      try { const results = statements.map(statement => statement._run()); db.exec('COMMIT'); return results; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    }
  };
}
