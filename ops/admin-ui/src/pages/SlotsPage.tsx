import { useEffect, useState } from "react";
import { api, type SlotRecord } from "../api.ts";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";
import { emptySlot, fromSlot, SlotEditor, type SlotDraft } from "./SlotEditor.tsx";

type SlotsPageProps = { onError: (message: string) => void };

export function SlotsPage({ onError }: SlotsPageProps) {
  const [slots, setSlots] = useState<SlotRecord[]>([]);
  const [editing, setEditing] = useState<{ id?: string; draft: SlotDraft } | null>(null);
  const [pending, setPending] = useState(false);
  const [removing, setRemoving] = useState<SlotRecord | null>(null);

  async function refresh() {
    const data = await api.slots();
    setSlots(data.slots);
  }

  useEffect(() => {
    refresh().catch((error: Error) => onError(error.message));
  }, [onError]);

  async function save() {
    if (!editing) {
      return;
    }
    setPending(true);
    try {
      if (editing.id) {
        await api.updateSlot(editing.id, editing.draft);
      } else {
        await api.createSlot(editing.draft);
      }
      setEditing(null);
      await refresh();
    } catch (error) {
      onError(error instanceof Error ? error.message : "保存失败");
    } finally {
      setPending(false);
    }
  }

  async function toggle(slot: SlotRecord) {
    try {
      await api.updateSlot(slot.id, { ...fromSlot(slot), enabled: !slot.enabled });
      await refresh();
    } catch (error) {
      onError(error instanceof Error ? error.message : "更新失败");
    }
  }

  async function move(index: number, delta: number) {
    const next = [...slots];
    const target = index + delta;
    if (target < 0 || target >= next.length) {
      return;
    }
    const [row] = next.splice(index, 1);
    next.splice(target, 0, row);
    setSlots(next);
    try {
      await api.reorderSlots(next.map((item) => item.id));
    } catch (error) {
      onError(error instanceof Error ? error.message : "排序失败");
      await refresh();
    }
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>广告位</h1>
          <p>只下发 placement=menu 且字段完整的槽位，客户端会再校验绝对 URL。</p>
        </div>
        <button className="primary" type="button" onClick={() => setEditing({ draft: emptySlot() })}>
          新增广告
        </button>
      </div>
      <div className="list">
        {slots.length === 0 ? <div className="card empty">还没有广告位</div> : null}
        {slots.map((slot, index) => (
          <article className="card row" key={slot.id}>
            <img src={slot.target.imageUrl} alt="" />
            <div>
              <h3>
                {slot.target.title}{" "}
                <span className={`badge ${slot.enabled ? "on" : ""}`}>{slot.enabled ? "启用" : "停用"}</span>
              </h3>
              <p>{slot.target.description}</p>
              <p className="mono">
                {slot.locale} · {slot.id}
              </p>
            </div>
            <div className="row-actions">
              <button className="ghost" type="button" onClick={() => move(index, -1)}>
                上移
              </button>
              <button className="ghost" type="button" onClick={() => move(index, 1)}>
                下移
              </button>
              <button className="ghost" type="button" onClick={() => toggle(slot)}>
                {slot.enabled ? "停用" : "启用"}
              </button>
              <button className="ghost" type="button" onClick={() => setEditing({ id: slot.id, draft: fromSlot(slot) })}>
                编辑
              </button>
              <button className="danger" type="button" onClick={() => setRemoving(slot)}>
                删除
              </button>
            </div>
          </article>
        ))}
      </div>
      {editing ? (
        <SlotEditor
          title={editing.id ? "编辑广告位" : "新增广告位"}
          draft={editing.draft}
          pending={pending}
          onChange={(draft) => setEditing({ ...editing, draft })}
          onCancel={() => setEditing(null)}
          onSave={() => void save()}
        />
      ) : null}
      {removing ? (
        <ConfirmDialog
          title="删除广告位"
          message={`确认删除「${removing.target.title}」？此操作不可恢复。`}
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            api
              .deleteSlot(removing.id)
              .then(() => refresh())
              .catch((error: Error) => onError(error.message))
              .finally(() => setRemoving(null));
          }}
        />
      ) : null}
    </section>
  );
}
