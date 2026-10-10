import type { TabMode, TabSettings } from "../../shared/api";
import { Button } from "../../shared/ui/Button";
import { TextInput } from "../../shared/ui/FormControls";
import { Select } from "../../shared/ui/Select";
import { SettingRow, SettingsGroup } from "./SettingsGroup";
import styles from "./SettingsGroup.module.scss";

export function TabSettingsCard({
  settings,
  draft,
  editing,
  saving,
  onDraftChange,
  onEdit,
  onCancel,
  onSave,
}: {
  settings: TabSettings | null;
  draft: TabSettings;
  editing: boolean;
  saving: boolean;
  onDraftChange: (settings: TabSettings) => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const modeLabel = (mode: TabMode) => {
    if (mode === "public") return t("使用公益服务");
    if (mode === "direct") return t("直连");
    return t("自定义");
  };
  const action = editing ? (
    <div className={styles.actions}>
      <Button size="small" disabled={saving} onClick={onCancel}>{t("取消")}</Button>
      <Button variant="primary" size="small" disabled={saving} onClick={onSave}>{saving ? t("保存中…") : t("保存")}</Button>
    </div>
  ) : (
    <button type="button" className={styles.textButton} disabled={!settings} onClick={onEdit}>{t("编辑")}</button>
  );

  return <SettingsGroup title={t("TAB 设置")} action={action}>
    <SettingRow title={t("TAB 选择")} description={t("控制 Cursor TAB 相关接口的连接方式。")}>
      {editing
        ? <div className={styles.field}><Select
            value={draft.mode}
            ariaLabel={t("TAB 选择")}
            options={[
              { value: "public", label: t("使用公益服务") },
              { value: "direct", label: t("直连") },
              { value: "custom", label: t("自定义") },
            ]}
            onChange={(mode) => onDraftChange({ ...draft, mode: mode as TabMode })}
          /></div>
        : <span className={styles.value}>{settings ? modeLabel(settings.mode) : t("加载中…")}</span>}
    </SettingRow>
    {editing && draft.mode === "custom" && <SettingRow title={t("TAB 服务地址")} description={t("原接口路径会追加到此服务地址。")}>
      <div className={styles.field}><TextInput
        value={draft.address}
        placeholder="https://tab.susuan.ai"
        aria-label={t("TAB 服务地址")}
        onChange={(event) => onDraftChange({ ...draft, address: event.target.value })}
        onKeyDown={(event) => { if (event.key === "Enter") onSave(); }}
      /></div>
    </SettingRow>}
    {!editing && settings?.mode === "custom" && <SettingRow title={t("TAB 服务地址")} description={t("原接口路径会追加到此服务地址。")}>
      <span className={styles.value}>{settings.address}</span>
    </SettingRow>}
  </SettingsGroup>;
}
