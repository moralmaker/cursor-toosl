import type { Db, SqlValue } from "./database.ts";

export function createD1(database: D1Database): Db {
  return {
    async all<T>(sql: string, ...params: SqlValue[]): Promise<T[]> {
      const result = await database
        .prepare(sql)
        .bind(...params)
        .all<T>();
      return result.results ?? [];
    },
    async first<T>(sql: string, ...params: SqlValue[]): Promise<T | null> {
      const row = await database
        .prepare(sql)
        .bind(...params)
        .first<T>();
      return row ?? null;
    },
    async run(sql: string, ...params: SqlValue[]): Promise<{ changes: number; lastRowId: number }> {
      const result = await database
        .prepare(sql)
        .bind(...params)
        .run();
      return {
        changes: result.meta.changes ?? 0,
        lastRowId: Number(result.meta.last_row_id ?? 0),
      };
    },
    async batch(statements: { sql: string; params?: SqlValue[] }[]): Promise<void> {
      if (statements.length === 0) {
        return;
      }
      await database.batch(statements.map((statement) => database.prepare(statement.sql).bind(...(statement.params ?? []))));
    },
  };
}
