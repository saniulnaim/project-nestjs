import type { DataSource, EntityManager } from 'typeorm';

/**
 * TypeORM's SQLite driver reuses a single query runner, so a transaction
 * started while another is open becomes a SAVEPOINT inside it instead of an
 * independent transaction. Running them one after another avoids that.
 * Precaution only: the tests could not make the overlap misbehave, and the
 * guarded stock UPDATE in checkout already prevents overselling on its own.
 * Postgres gives each transaction its own connection and does not need this.
 */
let tail: Promise<unknown> = Promise.resolve();

export function runInTransaction<T>(
  dataSource: DataSource,
  work: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  const result = tail.then(() => dataSource.transaction(work));
  tail = result.catch(() => undefined);
  return result;
}
