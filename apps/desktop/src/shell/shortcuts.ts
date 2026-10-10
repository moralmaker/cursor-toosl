import { useSyncExternalStore } from "react";

export type ShortcutId = "overview" | "calls" | "cursor" | "plugins" | "settings" | "sidebar" | "palette";

export type KeyCombo = {
  key: string;
  mod: boolean;
  alt: boolean;
  shift: boolean;
};

export type ShortcutMap = Record<ShortcutId, KeyCombo | null>;

const STORAGE_KEY = "cursor-tools.shortcuts";

export const shortcutIds: ShortcutId[] = ["overview", "calls", "cursor", "plugins", "settings", "sidebar", "palette"];

const defaults: ShortcutMap = {
  overview: { key: "1", mod: true, alt: false, shift: false },
  calls: { key: "2", mod: true, alt: false, shift: false },
  cursor: { key: "3", mod: true, alt: false, shift: false },
  plugins: { key: "4", mod: true, alt: false, shift: false },
  settings: { key: "z", mod: true, alt: false, shift: false },
  sidebar: { key: "/", mod: true, alt: false, shift: false },
  palette: { key: "k", mod: true, alt: false, shift: false },
};

let snapshot = readStored();
let recording = false;
const listeners = new Set<() => void>();

const replacedDefaults: Partial<ShortcutMap> = {
  settings: { key: ",", mod: true, alt: false, shift: false },
  sidebar: { key: "\\", mod: true, alt: false, shift: false },
};

function sameCombo(left: KeyCombo | null | undefined, right: KeyCombo | null | undefined) {
  if (!left || !right) return false;
  return left.key === right.key && left.mod === right.mod && left.alt === right.alt && left.shift === right.shift;
}

function readStored(): ShortcutMap {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (!raw || typeof raw !== "object") return { ...defaults };
    const stored = raw as Partial<Record<ShortcutId, KeyCombo | null>>;
    let replaced = false;
    const next = Object.fromEntries(shortcutIds.map((id) => {
      const saved = sanitize(stored[id]);
      if (saved === undefined) return [id, defaults[id]];
      if (sameCombo(saved, replacedDefaults[id])) {
        replaced = true;
        return [id, defaults[id]];
      }
      return [id, saved];
    })) as ShortcutMap;
    if (replaced) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch {
    return { ...defaults };
  }
}

function sanitize(value: unknown): KeyCombo | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== "object") return undefined;
  const combo = value as Partial<KeyCombo>;
  if (typeof combo.key !== "string" || !combo.key) return undefined;
  return {
    key: combo.key.length === 1 ? combo.key.toLowerCase() : combo.key,
    mod: Boolean(combo.mod),
    alt: Boolean(combo.alt),
    shift: Boolean(combo.shift),
  };
}

function emit() {
  listeners.forEach((listener) => listener());
}

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); } catch { /* keep the in-memory map */ }
}

export function getShortcuts() {
  return snapshot;
}

export function subscribeShortcuts(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useShortcuts() {
  return useSyncExternalStore(subscribeShortcuts, getShortcuts, getShortcuts);
}

export function setShortcut(id: ShortcutId, combo: KeyCombo | null) {
  snapshot = { ...snapshot, [id]: combo };
  persist();
  emit();
}

export function resetShortcuts() {
  snapshot = { ...defaults };
  persist();
  emit();
}

export function setShortcutRecording(active: boolean) {
  recording = active;
}

export function isShortcutRecording() {
  return recording;
}

export function shortcutSignature(combo: KeyCombo | null) {
  if (!combo) return "";
  return `${combo.mod ? 1 : 0}${combo.alt ? 1 : 0}${combo.shift ? 1 : 0}:${combo.key}`;
}

export function conflictingShortcut(id: ShortcutId, map: ShortcutMap = snapshot) {
  const signature = shortcutSignature(map[id]);
  if (!signature) return null;
  return shortcutIds.find((other) => other !== id && shortcutSignature(map[other]) === signature) ?? null;
}

export function shortcutMatches(event: KeyboardEvent, combo: KeyCombo | null) {
  if (!combo || event.repeat || event.isComposing) return false;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  return key === combo.key
    && (event.metaKey || event.ctrlKey) === combo.mod
    && event.altKey === combo.alt
    && event.shiftKey === combo.shift;
}

export function formatShortcut(combo: KeyCombo | null, mac: boolean) {
  if (!combo) return "";
  const parts: string[] = [];
  if (mac) {
    if (!combo.mod && combo.alt === false && combo.shift === false) parts.length = 0;
    if (combo.alt) parts.push("⌥");
    if (combo.shift) parts.push("⇧");
    if (combo.mod) parts.push("⌘");
  } else {
    if (combo.mod) parts.push("Ctrl");
    if (combo.alt) parts.push("Alt");
    if (combo.shift) parts.push("Shift");
  }
  parts.push(combo.key.length === 1 ? combo.key.toUpperCase() : combo.key);
  return mac ? parts.join("") : parts.join("+");
}

export function comboFromEvent(event: KeyboardEvent): KeyCombo | null {
  if (["Meta", "Control", "Alt", "Shift", "Escape"].includes(event.key)) return null;
  const mod = event.metaKey || event.ctrlKey;
  if (!mod && !event.altKey && !event.shiftKey) return null;
  return {
    key: event.key.length === 1 ? event.key.toLowerCase() : event.key,
    mod,
    alt: event.altKey,
    shift: event.shiftKey,
  };
}
