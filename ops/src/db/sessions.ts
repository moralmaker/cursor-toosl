import type { AttemptRow } from "../domain/lock.ts";
import type { Db } from "./database.ts";

export type SessionRow = {
  id: string;
  created_at: string;
  expires_at: string;
  ip: string | null;
};

type AttemptDbRow = {
  key: string;
  attempts: number;
  locked_until: string | null;
  window_start: string | null;
  updated_at: string;
};

function toAttempt(row: AttemptDbRow): AttemptRow {
  return {
    key: row.key,
    attempts: row.attempts,
    lockedUntil: row.locked_until,
    windowStart: row.window_start,
    updatedAt: row.updated_at,
  };
}

export async function createSession(
  db: Db,
  id: string,
  createdAt: string,
  expiresAt: string,
  ip: string,
): Promise<void> {
  await db.run(
    "INSERT INTO sessions (id, created_at, expires_at, ip) VALUES (?, ?, ?, ?)",
    id,
    createdAt,
    expiresAt,
    ip,
  );
}

export async function getSession(db: Db, id: string): Promise<SessionRow | null> {
  return db.first<SessionRow>("SELECT id, created_at, expires_at, ip FROM sessions WHERE id = ?", id);
}

export async function deleteSession(db: Db, id: string): Promise<void> {
  await db.run("DELETE FROM sessions WHERE id = ?", id);
}

export async function deleteExpiredSessions(db: Db, now: string): Promise<void> {
  await db.run("DELETE FROM sessions WHERE expires_at < ?", now);
}

export async function getAttempt(db: Db, key: string): Promise<AttemptRow | null> {
  const row = await db.first<AttemptDbRow>(
    "SELECT key, attempts, locked_until, window_start, updated_at FROM login_attempts WHERE key = ?",
    key,
  );
  return row ? toAttempt(row) : null;
}

export async function putAttempt(db: Db, row: AttemptRow): Promise<void> {
  await db.run(
    `INSERT INTO login_attempts (key, attempts, locked_until, window_start, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       attempts = excluded.attempts,
       locked_until = excluded.locked_until,
       window_start = excluded.window_start,
       updated_at = excluded.updated_at`,
    row.key,
    row.attempts,
    row.lockedUntil,
    row.windowStart,
    row.updatedAt,
  );
}

export async function clearAttempts(db: Db, key: string): Promise<void> {
  await db.run("DELETE FROM login_attempts WHERE key = ?", key);
}
