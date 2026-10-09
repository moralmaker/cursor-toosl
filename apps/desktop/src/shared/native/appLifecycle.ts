import { getVersion, setDockVisibility } from "@tauri-apps/api/app";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { api, type DesktopSettings } from "../api";
import { desktopPlatform } from "./platform";

export function hasNativeAppLifecycle(): boolean {
  return isTauri();
}

export function hasDockVisibilitySetting(): boolean {
  return hasNativeAppLifecycle() && desktopPlatform() === "macos";
}

export async function currentAppVersion(): Promise<string> {
  return hasNativeAppLifecycle() ? getVersion() : "dev";
}

export async function readAutostart(): Promise<boolean> {
  return isEnabled();
}

export async function writeAutostart(enabled: boolean): Promise<void> {
  await (enabled ? enable() : disable());
}

export async function readDesktopSettings(): Promise<DesktopSettings> {
  return api.desktopSettings();
}

export async function writeSilentStart(silentStart: boolean): Promise<void> {
  const settings = await readDesktopSettings();
  await api.setDesktopSettings({ ...settings, silent_start: silentStart });
}

export async function writeDockIconVisibility(visible: boolean): Promise<void> {
  const settings = await readDesktopSettings();
  await setDockVisibility(visible);
  try {
    await api.setDesktopSettings({ ...settings, show_dock_icon: visible });
  } catch (cause) {
    await setDockVisibility(settings.show_dock_icon).catch(() => {});
    throw cause;
  }
}

export type UpdateInstallProgress = {
  phase: "download" | "install";
  downloadedBytes: number;
  totalBytes: number | null;
};

export type AppUpdate = {
  version: string;
  install(onProgress?: (progress: UpdateInstallProgress) => void): Promise<void>;
  close(): Promise<void>;
};

type PortableUpdateInfo = {
  version: string;
};

export async function checkForUpdate(): Promise<AppUpdate | null> {
  if (desktopPlatform() === "windows") {
    const update = await invoke<PortableUpdateInfo | null>("check_portable_update");
    if (!update) return null;
    return {
      version: update.version,
      install: async (onProgress) => {
        onProgress?.({ phase: "download", downloadedBytes: 0, totalBytes: null });
        await invoke("install_portable_update", { expectedVersion: update.version });
      },
      close: async () => {},
    };
  }

  const update: Update | null = await check();
  if (!update) return null;
  return {
    version: update.version,
    install: async (onProgress) => {
      let downloadedBytes = 0;
      let totalBytes: number | null = null;
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            downloadedBytes = 0;
            totalBytes = event.data.contentLength ?? null;
            onProgress?.({ phase: "download", downloadedBytes, totalBytes });
            break;
          case "Progress":
            downloadedBytes += event.data.chunkLength;
            onProgress?.({ phase: "download", downloadedBytes, totalBytes });
            break;
          case "Finished":
            onProgress?.({ phase: "install", downloadedBytes, totalBytes });
            break;
        }
      });
      await relaunch();
    },
    close: () => update.close(),
  };
}

export async function installUpdate(
  update: AppUpdate,
  onProgress?: (progress: UpdateInstallProgress) => void,
): Promise<void> {
  await update.install(onProgress);
}
