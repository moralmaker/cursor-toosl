import type { SlotInput, StoredSlot } from "../domain/slot.ts";
import type { Db } from "./database.ts";

type SlotRow = {
  id: string;
  enabled: number;
  dismissible: number;
  placement: string;
  locale: string;
  sort_order: number;
  starts_at: string | null;
  ends_at: string | null;
  target: string;
  content: string;
  created_at: string;
  updated_at: string;
};

function rowToSlot(row: SlotRow): StoredSlot {
  return {
    id: row.id,
    enabled: row.enabled === 1,
    dismissible: row.dismissible === 1,
    placement: "menu",
    locale: row.locale as StoredSlot["locale"],
    sortOrder: row.sort_order,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    target: JSON.parse(row.target),
    content: JSON.parse(row.content),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listSlots(db: Db): Promise<StoredSlot[]> {
  const rows = await db.all<SlotRow>(
    "SELECT * FROM slots ORDER BY sort_order ASC, created_at ASC",
  );
  return rows.map(rowToSlot);
}

export async function getSlot(db: Db, id: string): Promise<StoredSlot | null> {
  const row = await db.first<SlotRow>("SELECT * FROM slots WHERE id = ?", id);
  return row ? rowToSlot(row) : null;
}

export async function insertSlot(db: Db, id: string, value: SlotInput, now: string): Promise<void> {
  await db.run(
    `INSERT INTO slots (
      id, enabled, dismissible, placement, locale, sort_order, starts_at, ends_at, target, content, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    value.enabled ? 1 : 0,
    value.dismissible ? 1 : 0,
    value.placement,
    value.locale,
    value.sortOrder,
    value.startsAt ?? null,
    value.endsAt ?? null,
    JSON.stringify(value.target),
    JSON.stringify(value.content),
    now,
    now,
  );
}

export async function updateSlot(db: Db, id: string, value: SlotInput, now: string): Promise<boolean> {
  const result = await db.run(
    `UPDATE slots SET
      enabled = ?, dismissible = ?, placement = ?, locale = ?, sort_order = ?, starts_at = ?, ends_at = ?,
      target = ?, content = ?, updated_at = ?
     WHERE id = ?`,
    value.enabled ? 1 : 0,
    value.dismissible ? 1 : 0,
    value.placement,
    value.locale,
    value.sortOrder,
    value.startsAt ?? null,
    value.endsAt ?? null,
    JSON.stringify(value.target),
    JSON.stringify(value.content),
    now,
    id,
  );
  return result.changes > 0;
}

export async function deleteSlot(db: Db, id: string): Promise<boolean> {
  const result = await db.run("DELETE FROM slots WHERE id = ?", id);
  return result.changes > 0;
}

export async function reorderSlots(db: Db, ids: string[], now: string): Promise<void> {
  await db.batch(
    ids.map((id, index) => ({
      sql: "UPDATE slots SET sort_order = ?, updated_at = ? WHERE id = ?",
      params: [index, now, id],
    })),
  );
}
