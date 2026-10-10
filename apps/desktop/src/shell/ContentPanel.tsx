import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ScrollableContent } from "../shared/virtual/ScrollableContent";
import { useContentOverlayHost } from "./contentOverlay";
import styles from "./ContentPanel.module.scss";

type ContentPanelProps = {
  open: boolean;
  title: string;
  variant?: "sheet" | "drawer";
  children: ReactNode;
  aside?: ReactNode;
  extra?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
};

export function ContentPanel({ open, title, variant = "sheet", children, aside, extra, footer, onClose }: ContentPanelProps) {
  const host = useContentOverlayHost();
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const titleId = useId();
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const panels = host?.querySelectorAll("[data-content-panel]");
      if (panels?.length && panels[panels.length - 1] !== panel.current) return;
      event.preventDefault();
      closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    const frame = requestAnimationFrame(() => panel.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
    };
  }, [host, open]);

  if (!open || !host) return null;
  return createPortal(
    <div ref={panel} data-content-panel className={variant === "drawer" ? styles.drawer : styles.sheet} role="dialog" aria-modal="false" aria-labelledby={titleId} tabIndex={-1}>
      <header id={titleId}>
        <button type="button" onClick={onClose}>{t("返回")}</button>
        <strong>{title}</strong>
        {extra}
      </header>
      <div className={styles.body}>
        <ScrollableContent className={styles.main} contentClassName={styles.mainContent}>{children}</ScrollableContent>
        {aside && <ScrollableContent className={styles.aside} contentClassName={styles.asideContent}>{aside}</ScrollableContent>}
      </div>
      {footer && <footer>{footer}</footer>}
    </div>,
    host,
  );
}
