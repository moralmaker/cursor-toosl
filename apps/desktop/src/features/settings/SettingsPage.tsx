import { useEffect, useState } from "react";
import { api, type ProxySettings, type ProxySettingsInput, type StatisticsStorage, type StatisticsStorageScope, type TabSettings } from "../../shared/api";
import { PageContent } from "../../shell/layout/PageContent";
import { PageActions } from "../../shell/PageActions";
import { Icon } from "../../shared/ui/Icon";
import { solarNav } from "../../shared/ui/solarNav";
import { LegacyModelImport } from "../models/LegacyModelImport";
import { AboutSettingsCard } from "./AboutSettingsCard";
import { AppLifecycleSettingsCard } from "./AppLifecycleSettingsCard";
import { CommitSettingsCard } from "./CommitSettingsCard";
import { ProxySettingsCard } from "./ProxySettingsCard";
import { TabSettingsCard } from "./TabSettingsCard";
import { Button } from "../../shared/ui/Button";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { TextInput } from "../../shared/ui/FormControls";
import { Select } from "../../shared/ui/Select";
import { Switch } from "../../shared/ui/Switch";
import { SettingRow, SettingsGroup } from "./SettingsGroup";
import { ShortcutSettingsCard } from "./ShortcutSettingsCard";
import groupStyles from "./SettingsGroup.module.scss";
import { setLocalePreference, useI18n, type LocalePreference } from "../../i18n/store";
import { useMessage } from "../../shared/ui/message";
import { appStore, useAppStore } from "../../shared/store/appStore";
import { themeOptions } from "../../shared/theme/theme";
import styles from "./SettingsPage.module.scss";

export function SettingsPage() {
  const { detailed, ports, theme } = useAppStore();
  const { preference, locale } = useI18n();
  const message = useMessage();
  const [proxyPort, setProxyPort] = useState(String(ports.proxy_port));
  const [servicePort, setServicePort] = useState(String(ports.service_port));
  const [editingPorts, setEditingPorts] = useState(false);
  const [savingPorts, setSavingPorts] = useState(false);
  const [storage, setStorage] = useState<StatisticsStorage | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearScope, setClearScope] = useState<StatisticsStorageScope>("details");
  const [clearing, setClearing] = useState(false);
  const [outboundProxy, setOutboundProxy] = useState<ProxySettings | null>(null);
  const [proxyDraft, setProxyDraft] = useState<ProxySettingsInput>({ mode: "default", address: "", auth_enabled: false, username: "", password: "" });
  const [editingProxy, setEditingProxy] = useState(false);
  const [savingProxy, setSavingProxy] = useState(false);
  const [tabSettings, setTabSettings] = useState<TabSettings | null>(null);
  const [tabDraft, setTabDraft] = useState<TabSettings>({ mode: "public", address: "" });
  const [editingTab, setEditingTab] = useState(false);
  const [savingTab, setSavingTab] = useState(false);
  const [section, setSection] = useState<SettingsSection>("general");
  const [query, setQuery] = useState("");
  useEffect(() => {
    void Promise.all([api.statisticsStorage(), api.proxySettings(), api.tabSettings()]).then(([nextStorage, nextProxy, nextTab]) => {
      setStorage(nextStorage);
      setOutboundProxy(nextProxy);
      setProxyDraft({ mode: nextProxy.mode, address: nextProxy.address, auth_enabled: nextProxy.auth_enabled, username: nextProxy.username, password: "" });
      setTabSettings(nextTab);
      setTabDraft(nextTab);
    }).catch((cause) => message(cause instanceof Error ? cause.message : String(cause)));
  }, [message]);
  useEffect(() => {
    setProxyPort(String(ports.proxy_port));
    setServicePort(String(ports.service_port));
  }, [ports.proxy_port, ports.service_port]);

  const parsePort = (value: string, label: string) => {
    const port = Number(value);
    if (!Number.isInteger(port) || port < 0 || port > 65_535) {
      throw new Error(`${label}${t("必须是 0–65535 之间的整数")}`);
    }
    return port;
  };
  const savePorts = async () => {
    try {
      const next = {
        proxy_port: parsePort(proxyPort, t("代理端口")),
        service_port: parsePort(servicePort, t("服务端口")),
      };
      setSavingPorts(true);
      if (await appStore.updatePorts(next)) {
        setEditingPorts(false);
        message(t("端口设置已保存，重启软件后生效"), { duration: 4_000 });
      }
    } catch (cause) {
      message(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSavingPorts(false);
    }
  };
  const editPorts = () => {
    setProxyPort(String(ports.proxy_port));
    setServicePort(String(ports.service_port));
    setEditingPorts(true);
  };
  const cancelPortEdit = () => {
    setProxyPort(String(ports.proxy_port));
    setServicePort(String(ports.service_port));
    setEditingPorts(false);
  };
  const clearStorage = async () => {
    try {
      setClearing(true);
      setStorage(await api.clearStatisticsStorage(clearScope));
      setConfirmClear(false);
      await appStore.refresh();
      message(clearScope === "all" ? t("全部统计数据已清理") : t("详细记录已清理"));
    } catch (cause) {
      message(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setClearing(false);
    }
  };
  const editProxy = () => {
    if (!outboundProxy) return;
    setProxyDraft({ mode: outboundProxy.mode, address: outboundProxy.address, auth_enabled: outboundProxy.auth_enabled, username: outboundProxy.username, password: "" });
    setEditingProxy(true);
  };
  const cancelProxyEdit = () => {
    if (outboundProxy) {
      setProxyDraft({ mode: outboundProxy.mode, address: outboundProxy.address, auth_enabled: outboundProxy.auth_enabled, username: outboundProxy.username, password: "" });
    }
    setEditingProxy(false);
  };
  const saveProxy = async () => {
    try {
      setSavingProxy(true);
      const saved = await api.setProxySettings({ ...proxyDraft, password: proxyDraft.password || undefined });
      setOutboundProxy(saved);
      setProxyDraft({ mode: saved.mode, address: saved.address, auth_enabled: saved.auth_enabled, username: saved.username, password: "" });
      setEditingProxy(false);
      message(t("代理设置已保存"));
    } catch (cause) {
      message(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSavingProxy(false);
    }
  };
  const editTab = () => {
    if (!tabSettings) return;
    setTabDraft(tabSettings);
    setEditingTab(true);
  };
  const cancelTabEdit = () => {
    if (tabSettings) setTabDraft(tabSettings);
    setEditingTab(false);
  };
  const saveTab = async () => {
    try {
      if (tabDraft.mode === "custom" && !tabDraft.address.trim()) throw new Error(t("TAB 服务地址不能为空"));
      setSavingTab(true);
      const saved = await api.setTabSettings({ ...tabDraft, address: tabDraft.address.trim() });
      setTabSettings(saved);
      setTabDraft(saved);
      setEditingTab(false);
      message(t("TAB 设置已保存"));
    } catch (cause) {
      message(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSavingTab(false);
    }
  };
  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
    return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
  };
  const clearTitle = clearScope === "all" ? t("确定要清理全部统计数据吗？") : t("确定要清理详细记录吗？");
  const clearDescription = clearScope === "all"
    ? t("所有调用汇总、详细内容和追踪记录都会被删除。模型配置、CA 和应用设置不会受到影响，此操作无法撤销。")
    : t("仅删除请求、响应和追踪附件等详细内容，保留调用汇总、统计指标和配置。");
  const groups: Array<{ id: SettingsSection; label: string; text: string }> = [
    { id: "general", label: t("通用"), text: [t("通用"), t("界面语言"), t("主题"), t("默认暗色"), t("默认亮色"), t("跟随系统")].join(" ") },
    { id: "observe", label: t("调用观测"), text: [t("调用观测"), t("详细模式")].join(" ") },
    { id: "network", label: t("网络"), text: [t("网络"), t("端口设置"), t("代理端口"), t("服务端口"), t("代理")].join(" ") },
    { id: "tab", label: "TAB", text: "TAB" },
    { id: "commit", label: "Commit", text: "Commit" },
    { id: "app", label: t("应用"), text: [t("应用"), t("开机启动"), t("静默启动"), "Dock"].join(" ") },
    { id: "shortcuts", label: t("快捷键"), text: [t("快捷键"), t("收起侧栏"), t("命令面板"), t("恢复默认设置")].join(" ") },
    { id: "data", label: t("数据"), text: [t("数据"), t("导入"), t("旧版配置"), t("存储管理"), t("清理存储空间")].join(" ") },
    { id: "about", label: t("关于"), text: [t("关于"), t("版本"), t("检查更新"), t("官网"), t("更新日志"), "GitHub"].join(" ") },
  ];
  const needle = query.trim().toLowerCase();
  const visibleGroups = groups.filter((group) => !needle || group.text.toLowerCase().includes(needle));
  const shown = visibleGroups.some((group) => group.id === section) ? section : null;
  useEffect(() => {
    if (visibleGroups.length > 0 && !visibleGroups.some((group) => group.id === section)) setSection(visibleGroups[0].id);
  }, [needle]);
  const content = (
    <div className={styles.page}>
      <nav className={styles.sections} aria-label={t("设置")}>
        {visibleGroups.map((group) => (
          <button key={group.id} type="button" className={section === group.id ? styles.sectionOn : ""} aria-current={section === group.id ? "true" : undefined} onClick={() => setSection(group.id)}>{group.label}</button>
        ))}
      </nav>
      <div className={styles.content}>
      {visibleGroups.length === 0 && <div className={styles.empty}>{t("没有匹配的设置")}</div>}
      {shown === "observe" && <SettingsGroup title={t("调用观测")}>
        <SettingRow title={t("详细模式")} description={t("额外保存完整请求和流响应；默认只保存时间、状态与用量。")}>
          <Switch label={t("详细模式")} checked={detailed} onChange={(checked) => void appStore.updateDetailed(checked)} />
        </SettingRow>
      </SettingsGroup>}
      {shown === "network" && <>
        <SettingsGroup title={t("端口设置")} action={editingPorts ? (
          <div className={groupStyles.actions}>
            <Button size="small" disabled={savingPorts} onClick={cancelPortEdit}>{t("取消")}</Button>
            <Button variant="primary" size="small" disabled={savingPorts} onClick={() => void savePorts()}>{savingPorts ? t("保存中…") : t("保存")}</Button>
          </div>
        ) : (
          <button type="button" className={groupStyles.textButton} onClick={editPorts}>{t("编辑")}</button>
        )}>
          <SettingRow title={t("代理端口")} description={t("Cursor 使用的本地代理端口；填写 0 时启动时随机选择。")}>
            {editingPorts
              ? <div className={groupStyles.field}><TextInput type="number" min={0} max={65535} step={1} value={proxyPort} aria-label={t("代理端口")} onChange={(event) => setProxyPort(event.target.value)} /></div>
              : <span className={styles.mono}>{ports.proxy_port}</span>}
          </SettingRow>
          <SettingRow title={t("服务端口")} description={`${t("桌面前端连接的本地管理服务端口；填写 0 时启动时随机选择。")}${t("端口被占用时会自动选择新的随机端口并保存。修改后需要重启软件才会生效。")}`}>
            {editingPorts
              ? <div className={groupStyles.field}><TextInput type="number" min={0} max={65535} step={1} value={servicePort} aria-label={t("服务端口")} onChange={(event) => setServicePort(event.target.value)} /></div>
              : <span className={styles.mono}>{ports.service_port}</span>}
          </SettingRow>
        </SettingsGroup>
        <ProxySettingsCard settings={outboundProxy} draft={proxyDraft} editing={editingProxy} saving={savingProxy} onDraftChange={setProxyDraft} onEdit={editProxy} onCancel={cancelProxyEdit} onSave={() => void saveProxy()} />
      </>}
      {shown === "tab" && <TabSettingsCard settings={tabSettings} draft={tabDraft} editing={editingTab} saving={savingTab} onDraftChange={setTabDraft} onEdit={editTab} onCancel={cancelTabEdit} onSave={() => void saveTab()} />}
      {shown === "commit" && <CommitSettingsCard />}
      {shown === "app" && <AppLifecycleSettingsCard />}
      {shown === "shortcuts" && <ShortcutSettingsCard />}
      {shown === "data" && <LegacyModelImport>{({ busy, previewing, open }) => <SettingsGroup title={t("数据")}>
        <SettingRow title={t("旧版配置")} description={t("从本机旧版配置读取模型；确认前会显示新增和已存在的模型。")}>
          <Button size="small" disabled={busy} onClick={open}>
            {previewing ? t("读取中…") : t("查看并导入")}
          </Button>
        </SettingRow>
        <SettingRow title={t("统计数据")} description={storage ? formatBytes(storage.bytes) : t("计算中…")}>
          <Button size="small" className={styles.danger} onClick={() => { setClearScope("details"); setConfirmClear(true); }}>{t("清理存储空间")}</Button>
        </SettingRow>
      </SettingsGroup>}</LegacyModelImport>}
      {shown === "general" && <SettingsGroup title={t("通用")}>
        <SettingRow title={t("界面语言")} description={t("默认跟随操作系统；不支持的系统语言使用英文。当前：{language}", { language: locale === "zh-CN" ? "简体中文" : "English" })}>
          <div className={groupStyles.field}>
            <Select
              value={preference}
              ariaLabel={t("界面语言")}
              options={[
                { value: "system", label: t("跟随系统") },
                { value: "zh-CN", label: "简体中文" },
                { value: "en-US", label: "English" },
              ]}
              onChange={(value) => setLocalePreference(value as LocalePreference)}
            />
          </div>
        </SettingRow>
        <SettingRow title={t("主题")} description={t("默认暗色或默认亮色，选择后立即生效。")}>
          <div className={styles.segment} role="group" aria-label={t("主题")}>
            {themeOptions.map(({ id }) => (
              <button
                type="button"
                className={theme === id ? styles.segmentOn : ""}
                key={id}
                aria-pressed={theme === id}
                onClick={() => appStore.selectTheme(id)}
              >
                {id === "default-dark" ? t("默认暗色") : t("默认亮色")}
              </button>
            ))}
          </div>
        </SettingRow>
      </SettingsGroup>}
      {shown === "about" && <AboutSettingsCard />}
      <ConfirmDialog
        open={confirmClear}
        title={clearTitle}
        busy={clearing}
        cancelLabel={t("取消")}
        confirmLabel={t("确认清理")}
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => void clearStorage()}
      >
        <div className={styles.confirmContent}>
          <Select
            value={clearScope}
            ariaLabel={t("清理范围")}
            options={[
              { value: "details", label: t("仅清理详细记录") },
              { value: "all", label: t("清理全部统计数据") },
            ]}
            onChange={(value) => setClearScope(value as StatisticsStorageScope)}
          />
          <small>{clearDescription}</small>
        </div>
      </ConfirmDialog>
      </div>
    </div>
  );
  return <>
    <PageActions>
      <label className={styles.search}>
        <Icon icon={solarNav["minimalistic-magnifer"].line} size="1em" />
        <input value={query} placeholder={t("搜索设置")} aria-label={t("搜索设置")} onChange={(event) => setQuery(event.target.value)} />
      </label>
    </PageActions>
    <PageContent title={t("设置")} sections={[{ key: "settings", estimatedHeight: 1200, content }]} />
  </>;
}

type SettingsSection = "general" | "observe" | "network" | "tab" | "commit" | "app" | "shortcuts" | "data" | "about";
