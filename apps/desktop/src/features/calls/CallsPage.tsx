import { useEffect, useState } from "react";
import { CallDrawer } from "./CallDrawer";
import { CallTable, callColumnOrder, defaultVisibleCallColumns, type CallColumnKey } from "./CallTable";
import { CallToolbar, type CallStatusFilter } from "./CallToolbar";
import { PageContent } from "../../shell/layout/PageContent";
import { PageActions } from "../../shell/PageActions";
import type { LlmCall } from "../../shared/api";
import { appStore, useAppStore } from "../../shared/store/appStore";
import styles from "./CallsPage.module.scss";

const CALL_REFRESH_INTERVAL_MS = 2_000;
const COLUMN_STORAGE_KEY = "cursor-tools.calls.columns";

const knownColumns = new Set<string>(callColumnOrder);

function readVisibleColumns(): CallColumnKey[] {
  try {
    const raw = localStorage.getItem(COLUMN_STORAGE_KEY);
    if (!raw) return defaultVisibleCallColumns;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return defaultVisibleCallColumns;
    const next = parsed.filter((key): key is CallColumnKey => typeof key === "string" && knownColumns.has(key));
    return next.length > 0 ? next : defaultVisibleCallColumns;
  } catch {
    return defaultVisibleCallColumns;
  }
}

function matchesStatus(call: LlmCall, status: CallStatusFilter) {
  if (status === "all") return true;
  if (status === "running") return call.status === "running";
  if (status === "completed") return call.status === "completed";
  return call.status === "error" || call.status === "failed" || call.status === "cancelled";
}

function matchesQuery(call: LlmCall, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return `${call.display_name} ${call.model_id} ${call.call_id}`.toLowerCase().includes(needle);
}

export function CallsPage() {
  const { calls } = useAppStore();
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<CallStatusFilter>("all");
  const [visibleColumns, setVisibleColumns] = useState<CallColumnKey[]>(readVisibleColumns);
  const visible = new Set(visibleColumns);
  const shown = calls.filter((call) => matchesStatus(call, status) && matchesQuery(call, query));

  useEffect(() => {
    let disposed = false;
    const refreshCalls = () => {
      if (!disposed && document.visibilityState === "visible") {
        void appStore.refreshCalls();
      }
    };

    refreshCalls();
    const interval = window.setInterval(refreshCalls, CALL_REFRESH_INTERVAL_MS);
    window.addEventListener("focus", refreshCalls);
    document.addEventListener("visibilitychange", refreshCalls);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshCalls);
      document.removeEventListener("visibilitychange", refreshCalls);
    };
  }, []);

  const toggleColumn = (key: CallColumnKey) => {
    setVisibleColumns((current) => {
      const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
      const stored = next.length > 0 ? next : current;
      localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(stored));
      return stored;
    });
  };

  const content = <div className={styles.page}>
    <CallTable key={`${status}:${query}`} calls={shown} visible={visible} onDetails={(call) => setSelectedCallId(call.call_id)} />
  </div>;
  return <>
    <PageContent fixed title={t("调用")} contentClassName={styles.pageContent} sections={[{ key: "calls", estimatedHeight: 720, content }]} />
    <PageActions position="left">
      <CallToolbar
        query={query}
        status={status}
        visible={visible}
        onQueryChange={setQuery}
        onStatusChange={setStatus}
        onToggleColumn={toggleColumn}
      />
    </PageActions>
    {selectedCallId && <CallDrawer callId={selectedCallId} onClose={() => setSelectedCallId(null)} />}
  </>;
}
