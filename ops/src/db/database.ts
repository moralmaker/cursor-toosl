export type SqlValue = string | number | null;

export type Db = {
  all<T>(sql: string, ...params: SqlValue[]): Promise<T[]>;
  first<T>(sql: string, ...params: SqlValue[]): Promise<T | null>;
  run(sql: string, ...params: SqlValue[]): Promise<{ changes: number; lastRowId: number }>;
  batch(statements: { sql: string; params?: SqlValue[] }[]): Promise<void>;
};
