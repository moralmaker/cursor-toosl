import { useState } from "react";
import type { SlotButton, SlotRecord } from "../api.ts";
import { Field, Select, TextArea, TextInput } from "../components/Field.tsx";
import { ImageField } from "../components/ImageField.tsx";

type SlotInput = Omit<SlotRecord, "id" | "createdAt" | "updatedAt">;

export type SlotDraft = Omit<SlotInput, "content"> & {
  content: Omit<SlotInput["content"], "button"> & { button: SlotButton };
};

function emptyButton(): SlotButton {
  return { label: "", action: { type: "open_browser", url: "" } };
}

export function toSlotInput(draft: SlotDraft): { value: SlotInput } | { error: string } {
  const { button, ...content } = draft.content;
  const label = button.label.trim();
  const url = button.action.url.trim();
  if (!label && !url) {
    return { value: { ...draft, content } };
  }
  if (!label || !url) {
    return { error: "按钮文案和按钮链接需同时填写，或同时留空" };
  }
  return { value: { ...draft, content: { ...content, button: { label, action: { type: "open_browser", url } } } } };
}

export function emptySlot(): SlotDraft {
  return {
    enabled: true,
    dismissible: true,
    placement: "menu",
    locale: "all",
    sortOrder: 0,
    startsAt: null,
    endsAt: null,
    target: { title: "", description: "", imageUrl: "" },
    content: {
      title: "",
      description: "",
      imageUrl: "",
      details: [],
      button: emptyButton(),
    },
  };
}

export function fromSlot(slot: SlotRecord): SlotDraft {
  return {
    enabled: slot.enabled,
    dismissible: slot.dismissible,
    placement: slot.placement,
    locale: slot.locale,
    sortOrder: slot.sortOrder,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    target: slot.target,
    content: { ...slot.content, button: slot.content.button ?? emptyButton() },
  };
}

type SlotEditorProps = {
  title: string;
  draft: SlotDraft;
  onChange: (draft: SlotDraft) => void;
  onCancel: () => void;
  onSave: () => void;
  onError: (message: string) => void;
  pending: boolean;
};

export function SlotEditor({ title, draft, onChange, onCancel, onSave, onError, pending }: SlotEditorProps) {
  const [detailLabel, setDetailLabel] = useState("");
  const [detailValue, setDetailValue] = useState("");

  function patch(partial: Partial<SlotDraft>) {
    onChange({ ...draft, ...partial });
  }

  return (
    <div className="overlay">
      <div className="modal">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="ghost" type="button" onClick={onCancel}>
            关闭
          </button>
        </div>
        <div className="form-grid">
          <div className="fields">
            <div className="checks">
              <label style={{ flexDirection: "row", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(event) => patch({ enabled: event.target.checked })}
                />
                启用
              </label>
              <label
                style={{ flexDirection: "row", alignItems: "center" }}
                title="关闭后客户端不显示 ×，之前关闭过的用户也会重新看到"
              >
                <input
                  type="checkbox"
                  checked={draft.dismissible}
                  onChange={(event) => patch({ dismissible: event.target.checked })}
                />
                允许用户关闭
              </label>
              <Field label="语言">
                <Select
                  value={draft.locale}
                  onChange={(event) => patch({ locale: event.target.value as SlotDraft["locale"] })}
                >
                  <option value="all">全部</option>
                  <option value="zh-CN">zh-CN</option>
                  <option value="en-US">en-US</option>
                </Select>
              </Field>
              <Field label="排序">
                <TextInput
                  type="number"
                  value={draft.sortOrder}
                  onChange={(event) => patch({ sortOrder: Number(event.target.value) || 0 })}
                />
              </Field>
            </div>
            <div className="inline">
              <Field label="开始时间">
                <TextInput
                  type="datetime-local"
                  value={toLocal(draft.startsAt)}
                  onChange={(event) => patch({ startsAt: fromLocal(event.target.value) })}
                />
              </Field>
              <Field label="结束时间">
                <TextInput
                  type="datetime-local"
                  value={toLocal(draft.endsAt)}
                  onChange={(event) => patch({ endsAt: fromLocal(event.target.value) })}
                />
              </Field>
            </div>
            <Field label="菜单标题">
              <TextInput
                value={draft.target.title}
                onChange={(event) => patch({ target: { ...draft.target, title: event.target.value } })}
              />
            </Field>
            <Field label="菜单描述">
              <TextArea
                value={draft.target.description}
                onChange={(event) => patch({ target: { ...draft.target, description: event.target.value } })}
              />
            </Field>
            <ImageField
              label="菜单图"
              value={draft.target.imageUrl}
              onChange={(imageUrl) => patch({ target: { ...draft.target, imageUrl } })}
              onError={onError}
            />
            <Field label="弹层标题">
              <TextInput
                value={draft.content.title}
                onChange={(event) => patch({ content: { ...draft.content, title: event.target.value } })}
              />
            </Field>
            <Field label="弹层描述">
              <TextArea
                value={draft.content.description}
                onChange={(event) => patch({ content: { ...draft.content, description: event.target.value } })}
              />
            </Field>
            <ImageField
              label="弹层图"
              value={draft.content.imageUrl}
              onChange={(imageUrl) => patch({ content: { ...draft.content, imageUrl } })}
              onError={onError}
            />
            <div className="inline">
              <Field label="按钮文案（可选）">
                <TextInput
                  value={draft.content.button.label}
                  onChange={(event) =>
                    patch({
                      content: { ...draft.content, button: { ...draft.content.button, label: event.target.value } },
                    })
                  }
                />
              </Field>
              <Field label="按钮链接（可选）">
                <TextInput
                  value={draft.content.button.action.url}
                  onChange={(event) =>
                    patch({
                      content: {
                        ...draft.content,
                        button: {
                          ...draft.content.button,
                          action: { type: "open_browser", url: event.target.value },
                        },
                      },
                    })
                  }
                />
              </Field>
            </div>
            <div>
              <p style={{ margin: "0 0 8px", color: "var(--muted)" }}>明细</p>
              {draft.content.details.map((detail, index) => (
                <div className="inline" key={`${detail.label}-${index}`}>
                  <span className="mono">
                    {detail.label}: {detail.value}
                  </span>
                  <button
                    className="ghost"
                    type="button"
                    onClick={() =>
                      patch({
                        content: {
                          ...draft.content,
                          details: draft.content.details.filter((_, i) => i !== index),
                        },
                      })
                    }
                  >
                    删除
                  </button>
                </div>
              ))}
              <div className="inline">
                <TextInput placeholder="标签" value={detailLabel} onChange={(event) => setDetailLabel(event.target.value)} />
                <TextInput placeholder="内容" value={detailValue} onChange={(event) => setDetailValue(event.target.value)} />
              </div>
              <button
                className="ghost"
                type="button"
                onClick={() => {
                  if (!detailLabel.trim() || !detailValue.trim()) {
                    return;
                  }
                  patch({
                    content: {
                      ...draft.content,
                      details: [...draft.content.details, { label: detailLabel.trim(), value: detailValue.trim() }],
                    },
                  });
                  setDetailLabel("");
                  setDetailValue("");
                }}
              >
                添加明细
              </button>
            </div>
          </div>
          <div className="preview">
            <p style={{ color: "var(--muted)" }}>菜单预览</p>
            <div className="preview-card">
              {draft.target.imageUrl ? <img src={draft.target.imageUrl} alt="" /> : <div />}
              <div>
                <strong>{draft.target.title || "标题"}</strong>
                <p>{draft.target.description || "描述"}</p>
              </div>
            </div>
            <p style={{ color: "var(--muted)" }}>弹层预览</p>
            <div className="preview-modal">
              {draft.content.imageUrl ? <img src={draft.content.imageUrl} alt="" /> : null}
              <h4>{draft.content.title || "弹层标题"}</h4>
              <p>{draft.content.description || "弹层描述"}</p>
              <ul>
                {draft.content.details.map((detail) => (
                  <li key={detail.label}>
                    {detail.label}: {detail.value}
                  </li>
                ))}
              </ul>
              {draft.content.button.label.trim() ? (
                <button className="primary" type="button">
                  {draft.content.button.label}
                </button>
              ) : null}
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button className="ghost" type="button" onClick={onCancel}>
            取消
          </button>
          <button className="primary" type="button" disabled={pending} onClick={onSave}>
            {pending ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

function toLocal(value: string | null): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocal(value: string): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
