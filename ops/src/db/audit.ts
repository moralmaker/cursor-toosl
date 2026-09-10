import type { Db } from "./database.ts";

export type AuditRow = {
  id: number;
  action: string;
  actor: string;
  detail: string | null;
  ip: string | null;
  created_at: string;
};

export async function writeAudit(
  db: Db,
  input: { action: string; actor: string; detail?: string; ip?: string },
): Promise<void> {
  try {
    await db.run(
      "INSERT INTO audit_log (action, actor, detail, ip, created_at) VALUES (?, ?, ?, ?, ?)",
      input.action,
      input.actor.slice(0, 80),
      (input.detail ?? "").slice(0, 500),
      (input.ip ?? "").slice(0, 100),
      new Date().toISOString(),
    );
  } catch {
    // 审计失败不影响主流程
  }
}

export async function listAudit(db: Db, limit: number): Promise<AuditRow[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  return db.all<AuditRow>(
    `SELECT id, action, actor, detail, ip, created_at FROM audit_log ORDER BY id DESC LIMIT ?`,
    safeLimit,
  );
}
