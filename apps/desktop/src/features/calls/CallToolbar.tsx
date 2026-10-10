import { autoUpdate, computePosition, flip, offset, shift, size } from "@floating-ui/dom";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../shared/ui/Icon";
import { solarNav } from "../../shared/ui/solarNav";
import { callColumnLabels, callColumnOrder, type CallColumnKey } from "./CallTable";
import styles from "./CallToolbar.module.scss";

export type CallStatusFilter = "all" | "running" | "completed" | "problem";

const filters: Array<{ id: CallStatusFilter; label: () => string }> = [
  { id: "all", label: () => t("全部") },
  { id: "running", label: () => t("进行中") },
  { id: "completed", label: () => t("成功") },
  { id: "problem", label: () => t("异常") },
];

export function CallToolbar({ query, status, visible, onQueryChange, onStatusChange, onToggleColumn }: {
  query: string;
  status: CallStatusFilter;
  visible: ReadonlySet<CallColumnKey>;
  onQueryChange: (value: string) => void;
  onStatusChange: (value: CallStatusFilter) => void;
  onToggleColumn: (key: CallColumnKey) => void;
}) {
  const labels = callColumnLabels();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, maxHeight: 360 });

  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return;
    return autoUpdate(trigger.current, menu.current, () => void computePosition(trigger.current!, menu.current!, {
      placement: "bottom-end",
      middleware: [offset(6), flip({ padding: 10 }), shift({ padding: 10 }), size({
        padding: 10,
        apply: ({ availableHeight }) => setPosition((current) => ({ ...current, maxHeight: Math.max(160, availableHeight) })),
      })],
    }).then(({ x, y }) => setPosition((current) => ({ ...current, left: x, top: y }))));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !menu.current?.contains(target)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return <div className={styles.bar}>
    <span className={styles.live}><i />{t("实时")}</span>
    <label className={styles.search}>
      <Icon icon={solarNav["minimalistic-magnifer"].line} size="1em" />
      <input
        value={query}
        placeholder={t("搜索名称、模型或调用 ID")}
        aria-label={t("搜索名称、模型或调用 ID")}
        onChange={(event) => onQueryChange(event.target.value)}
      />
    </label>
    <div className={styles.segment} role="group" aria-label={t("状态")}>
      {filters.map((filter) => <button
        key={filter.id}
        type="button"
        aria-pressed={status === filter.id}
        onClick={() => onStatusChange(filter.id)}
      >{filter.label()}</button>)}
    </div>
    <button
      ref={trigger}
      type="button"
      className={styles.columns}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={open ? menuId : undefined}
      onClick={() => setOpen((current) => !current)}
    >{t("列设置")}</button>
    {open && createPortal(
      <div
        id={menuId}
        ref={menu}
        className={styles.menu}
        role="dialog"
        aria-label={t("列设置")}
        style={{ left: position.left, top: position.top, maxHeight: position.maxHeight }}
      >
        {callColumnOrder.map((key) => <label key={key}>
          <input
            type="checkbox"
            checked={visible.has(key)}
            onChange={() => onToggleColumn(key)}
          />
          <span>{labels[key]}</span>
        </label>)}
      </div>,
      document.body,
    )}
  </div>;
}
