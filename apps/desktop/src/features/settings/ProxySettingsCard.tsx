import type { ProxySettings, ProxySettingsInput } from "../../shared/api";
import { Button } from "../../shared/ui/Button";
import { Checkbox } from "../../shared/ui/Checkbox";
import { TextInput } from "../../shared/ui/FormControls";
import { Select } from "../../shared/ui/Select";
import { SettingRow, SettingsGroup } from "./SettingsGroup";
import styles from "./SettingsGroup.module.scss";

export function ProxySettingsCard({
  settings,
  draft,
  editing,
  saving,
  onDraftChange,
  onEdit,
  onCancel,
  onSave,
}: {
  settings: ProxySettings | null;
  draft: ProxySettingsInput;
  editing: boolean;
  saving: boolean;
  onDraftChange: (draft: ProxySettingsInput) => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const custom = draft.mode === "custom";
  const modeLabel = (mode: ProxySettingsInput["mode"]) => mode === "default" ? t("默认") : t("自定义");
  const action = editing ? (
    <div className={styles.actions}>
      <Button size="small" disabled={saving} onClick={onCancel}>{t("取消")}</Button>
      <Button variant="primary" size="small" disabled={saving} onClick={onSave}>{saving ? t("保存中…") : t("保存")}</Button>
    </div>
  ) : (
    <button type="button" className={styles.textButton} disabled={!settings} onClick={onEdit}>{t("编辑")}</button>
  );

  return <SettingsGroup title={t("代理设置")} action={action}>
    <SettingRow title={t("代理方式")} description={t("默认直连，或填写自定义上游代理。")}>
      {editing
        ? <div className={styles.field}><Select ariaLabel={t("代理方式")} value={draft.mode} options={[{ value: "default", label: t("默认") }, { value: "custom", label: t("自定义") }]} onChange={(mode) => onDraftChange({ ...draft, mode: mode as ProxySettingsInput["mode"] })} /></div>
        : <span className={styles.value}>{settings ? modeLabel(settings.mode) : t("加载中…")}</span>}
    </SettingRow>
    {editing && custom && <>
      <SettingRow title={t("代理地址")}>
        <div className={styles.field}><TextInput value={draft.address} placeholder="http://127.0.0.1:7890" aria-label={t("代理地址")} onChange={(event) => onDraftChange({ ...draft, address: event.target.value })} /></div>
      </SettingRow>
      <SettingRow title={t("认证")}>
        <Checkbox checked={draft.auth_enabled} label={t("代理需要认证")} onChange={(auth_enabled) => onDraftChange({ ...draft, auth_enabled })} />
      </SettingRow>
      {draft.auth_enabled && <>
        <SettingRow title={t("用户名")}>
          <div className={styles.field}><TextInput value={draft.username} autoComplete="off" aria-label={t("用户名")} onChange={(event) => onDraftChange({ ...draft, username: event.target.value })} /></div>
        </SettingRow>
        <SettingRow title={t("密码")}>
          <div className={styles.field}><TextInput type="password" value={draft.password ?? ""} autoComplete="new-password" aria-label={t("密码")} placeholder={settings?.has_password ? t("留空表示保留当前密码") : ""} onChange={(event) => onDraftChange({ ...draft, password: event.target.value })} /></div>
        </SettingRow>
      </>}
    </>}
    {!editing && settings?.mode === "custom" && <>
      <SettingRow title={t("代理地址")}><span className={styles.value}>{settings.address}</span></SettingRow>
      <SettingRow title={t("认证")}><span className={styles.value}>{settings.auth_enabled ? t("已启用") : t("未启用")}</span></SettingRow>
      {settings.auth_enabled && <>
        <SettingRow title={t("用户名")}><span className={styles.value}>{settings.username || "—"}</span></SettingRow>
        <SettingRow title={t("密码")}><span className={styles.value}>{settings.has_password ? t("已设置") : t("未设置")}</span></SettingRow>
      </>}
    </>}
  </SettingsGroup>;
}
