import { useEffect, useState } from "react";
import { desktopPlatform } from "../../shared/native/platform";
import { Button } from "../../shared/ui/Button";
import {
  comboFromEvent,
  conflictingShortcut,
  formatShortcut,
  resetShortcuts,
  setShortcut,
  setShortcutRecording,
  useShortcuts,
  type ShortcutId,
} from "../../shell/shortcuts";
import { SettingRow, SettingsGroup } from "./SettingsGroup";
import styles from "./ShortcutSettingsCard.module.scss";

function actionLabel(id: ShortcutId) {
  switch (id) {
    case "overview": return t("概览");
    case "calls": return t("调用");
    case "cursor": return "Cursor";
    case "plugins": return t("插件");
    case "settings": return t("设置");
    case "sidebar": return t("收起侧栏");
    case "palette": return t("命令面板");
  }
}

export function ShortcutSettingsCard() {
  const shortcuts = useShortcuts();
  const mac = desktopPlatform() === "macos";
  const [recording, setRecording] = useState<ShortcutId | null>(null);

  useEffect(() => {
    setShortcutRecording(recording !== null);
    if (!recording) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setRecording(null);
        return;
      }
      const combo = comboFromEvent(event);
      if (!combo) return;
      event.preventDefault();
      event.stopPropagation();
      setShortcut(recording, combo);
      setRecording(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      setShortcutRecording(false);
    };
  }, [recording]);

  return <SettingsGroup title={t("快捷键")}>
    {(["overview", "calls", "cursor", "plugins", "settings", "sidebar", "palette"] as const).map((id) => {
      const combo = shortcuts[id];
      const conflict = conflictingShortcut(id, shortcuts);
      const active = recording === id;
      return <SettingRow
        key={id}
        title={actionLabel(id)}
        description={conflict ? t("与「{name}」冲突", { name: actionLabel(conflict) }) : undefined}
      >
        <span className={styles.combo} data-recording={active || undefined} data-conflict={conflict ? true : undefined}>
          <button
            type="button"
            className={styles.keys}
            aria-label={t("点击后按下新的快捷键")}
            onClick={() => setRecording(active ? null : id)}
          >
            {active ? t("请按下快捷键") : combo ? formatShortcut(combo, mac) : t("未设置")}
          </button>
          {combo && !active && <button
            type="button"
            className={styles.clear}
            aria-label={t("清除快捷键")}
            onClick={() => setShortcut(id, null)}
          >×</button>}
        </span>
      </SettingRow>;
    })}
    <div className={styles.restore}>
      <Button size="small" onClick={() => { setRecording(null); resetShortcuts(); }}>{t("恢复默认设置")}</Button>
    </div>
  </SettingsGroup>;
}
