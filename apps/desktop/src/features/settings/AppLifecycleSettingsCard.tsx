import { useEffect, useState } from "react";
import {
  hasDockVisibilitySetting,
  hasNativeAppLifecycle,
  readAutostart,
  readDesktopSettings,
  writeAutostart,
  writeDockIconVisibility,
  writeSilentStart,
} from "../../shared/native/appLifecycle";
import { Switch } from "../../shared/ui/Switch";
import { useMessage } from "../../shared/ui/message";
import { SettingRow, SettingsGroup } from "./SettingsGroup";

export function AppLifecycleSettingsCard() {
  const message = useMessage();
  const native = hasNativeAppLifecycle();
  const dockVisibilitySetting = hasDockVisibilitySetting();
  const [autostart, setAutostart] = useState(false);
  const [loadingAutostart, setLoadingAutostart] = useState(native);
  const [silentStart, setSilentStart] = useState(false);
  const [dockIconVisible, setDockIconVisible] = useState(true);
  const [loadingDesktopSettings, setLoadingDesktopSettings] = useState(native);

  useEffect(() => {
    let disposed = false;
    if (native) {
      void readAutostart()
        .then((enabled) => { if (!disposed) setAutostart(enabled); })
        .catch((cause) => message(cause instanceof Error ? cause.message : String(cause)))
        .finally(() => { if (!disposed) setLoadingAutostart(false); });
      void readDesktopSettings()
        .then((settings) => {
          if (disposed) return;
          setSilentStart(settings.silent_start);
          setDockIconVisible(settings.show_dock_icon);
        })
        .catch(() => {})
        .finally(() => {
          if (disposed) return;
          setLoadingDesktopSettings(false);
        });
    }
    return () => { disposed = true; };
  }, [message, native]);

  const toggleAutostart = async (enabled: boolean) => {
    try {
      setLoadingAutostart(true);
      await writeAutostart(enabled);
      setAutostart(await readAutostart());
      message(enabled ? t("已开启开机启动") : t("已关闭开机启动"));
    } catch (cause) {
      message(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoadingAutostart(false);
    }
  };

  const toggleSilentStart = async (enabled: boolean) => {
    try {
      setLoadingDesktopSettings(true);
      await writeSilentStart(enabled);
      setSilentStart(enabled);
      message(enabled ? t("已开启静默启动") : t("已关闭静默启动"));
    } catch (cause) {
      message(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoadingDesktopSettings(false);
    }
  };

  const toggleDockIcon = async (visible: boolean) => {
    try {
      setLoadingDesktopSettings(true);
      await writeDockIconVisibility(visible);
      setDockIconVisible(visible);
      message(visible ? t("已显示 Dock 栏图标") : t("已隐藏 Dock 栏图标"));
    } catch (cause) {
      message(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoadingDesktopSettings(false);
    }
  };

  return <SettingsGroup title={t("应用设置")}>
    <SettingRow title={t("开机启动")} description={t("登录系统后自动启动 Cursor TOOLS。")}>
      <Switch
        checked={autostart}
        disabled={!native || loadingAutostart}
        label={t("开机启动")}
        onChange={(enabled) => void toggleAutostart(enabled)}
      />
    </SettingRow>
    {autostart && <SettingRow title={t("静默启动")} description={t("开机启动时不显示主窗口，仅保留系统托盘图标。")}>
      <Switch
        checked={silentStart}
        disabled={!native || loadingDesktopSettings}
        label={t("静默启动")}
        onChange={(enabled) => void toggleSilentStart(enabled)}
      />
    </SettingRow>}
    {dockVisibilitySetting && <SettingRow title={t("在 Dock 栏显示")} description={t("关闭后隐藏 Dock 栏图标，仍可通过菜单栏图标打开应用。")}>
      <Switch
        checked={dockIconVisible}
        disabled={loadingDesktopSettings}
        label={t("在 Dock 栏显示")}
        onChange={(visible) => void toggleDockIcon(visible)}
      />
    </SettingRow>}
  </SettingsGroup>;
}
