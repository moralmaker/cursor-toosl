import { useSyncExternalStore } from "react";
import {
  checkForUpdate,
  hasNativeAppLifecycle,
  installUpdate,
  type AppUpdate,
  type UpdateInstallProgress,
} from "../native/appLifecycle";

export type UpdateSnapshot = {
  availableVersion: string | null;
  checking: boolean;
  installing: boolean;
  installProgress: UpdateInstallProgress | null;
};

let snapshot: UpdateSnapshot = {
  availableVersion: null,
  checking: false,
  installing: false,
  installProgress: null,
};
let availableUpdate: AppUpdate | null = null;
let pendingCheck: Promise<string | null> | null = null;
const listeners = new Set<() => void>();

function update(patch: Partial<UpdateSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((listener) => listener());
}

async function replaceAvailableUpdate(next: AppUpdate | null) {
  const previous = availableUpdate;
  availableUpdate = next;
  update({ availableVersion: next?.version ?? null });
  if (previous && previous !== next) await previous.close();
}

export const updateStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot: () => snapshot,

  async check(): Promise<string | null> {
    if (!hasNativeAppLifecycle()) return null;
    if (pendingCheck) return pendingCheck;
    update({ checking: true });
    pendingCheck = (async () => {
      const next = await checkForUpdate();
      await replaceAvailableUpdate(next);
      return next?.version ?? null;
    })();
    try {
      return await pendingCheck;
    } finally {
      pendingCheck = null;
      update({ checking: false });
    }
  },

  async install(): Promise<void> {
    const current = availableUpdate;
    if (!current) return;
    update({ installing: true, installProgress: { phase: "download", downloadedBytes: 0, totalBytes: null } });
    try {
      await installUpdate(current, (progress) => update({ installProgress: progress }));
    } finally {
      update({ installing: false, installProgress: null });
    }
  },
};

export function useUpdateStore(): UpdateSnapshot {
  return useSyncExternalStore(updateStore.subscribe, updateStore.getSnapshot);
}

export function formatUpdateProgress(progress: UpdateInstallProgress | null): string | null {
  if (!progress) return null;
  if (progress.phase === "install") return null;
  if (!progress.totalBytes || progress.totalBytes <= 0) {
    const mb = (progress.downloadedBytes / (1024 * 1024)).toFixed(1);
    return `${mb} MB`;
  }
  const percent = Math.min(100, Math.round((progress.downloadedBytes / progress.totalBytes) * 100));
  return `${percent}%`;
}
