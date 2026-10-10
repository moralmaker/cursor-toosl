import { useEffect, useState } from "react";
import { solarNav } from "../shared/ui/solarNav";
import { Icon } from "../shared/ui/Icon";
import styles from "./CommandPalette.module.scss";

type CommandPaletteProps = {
  onClose: () => void;
  onNavigate: (path: string) => void;
};

export function CommandPalette({ onClose, onNavigate }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const commands = [
    { label: t("概览"), path: "/" },
    { label: t("调用"), path: "/calls" },
    { label: "Cursor", path: "/harness/cursor" },
    { label: t("插件"), path: "/plugins" },
    { label: t("设置"), path: "/settings" },
    { label: t("关于"), path: "/settings" },
  ];
  const visible = commands.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return <div className={styles.scrim} onMouseDown={onClose}>
    <div className={styles.panel} role="dialog" aria-label={t("命令面板")} onMouseDown={(event) => event.stopPropagation()}>
      <input autoFocus value={query} placeholder={t("搜索页面")} onChange={(event) => setQuery(event.target.value)} />
      {visible.map((item) => <button key={item.label} type="button" onClick={() => { onNavigate(item.path); onClose(); }}>
        <Icon icon={solarNav["minimalistic-magnifer"].line} size="1em" />
        <span>{item.label}</span>
      </button>)}
    </div>
  </div>;
}
