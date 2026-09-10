import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "./api.ts";
import { Toast } from "./components/Toast.tsx";
import { AuditPage } from "./pages/AuditPage.tsx";
import { DismissalsPage } from "./pages/DismissalsPage.tsx";
import { LoginPage } from "./pages/LoginPage.tsx";
import { ReleasesPage } from "./pages/ReleasesPage.tsx";
import { SlotsPage } from "./pages/SlotsPage.tsx";

type Page = "slots" | "releases" | "dismissals" | "audit";

export function App() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [page, setPage] = useState<Page>("slots");
  const [username, setUsername] = useState("admin");
  const [toast, setToast] = useState<string | null>(null);

  const showError = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  const loadSession = useCallback(async () => {
    try {
      const me = await api.me();
      setUsername(me.username);
      setAuthed(true);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setAuthed(false);
      } else {
        showError(error instanceof Error ? error.message : "无法连接服务");
      }
    } finally {
      setReady(true);
    }
  }, [showError]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  if (!ready) {
    return <div className="login-wrap">加载中…</div>;
  }
  if (!authed) {
    return (
      <>
        <LoginPage
          onLoggedIn={() => {
            setAuthed(true);
            void loadSession();
          }}
        />
        <Toast message={toast} />
      </>
    );
  }

  return (
    <div className="app-shell">
      <aside className="nav">
        <div className="brand">
          <small>Cursor TOOLS</small>
          <strong>运营台</strong>
        </div>
        <div className="nav-links">
          <button className={page === "slots" ? "active" : ""} type="button" onClick={() => setPage("slots")}>
            广告位
          </button>
          <button className={page === "releases" ? "active" : ""} type="button" onClick={() => setPage("releases")}>
            版本发布
          </button>
          <button className={page === "dismissals" ? "active" : ""} type="button" onClick={() => setPage("dismissals")}>
            关闭反馈
          </button>
          <button className={page === "audit" ? "active" : ""} type="button" onClick={() => setPage("audit")}>
            审计日志
          </button>
        </div>
        <div style={{ marginTop: 36 }}>
          <p style={{ color: "var(--muted)" }}>{username}</p>
          <button
            className="ghost"
            type="button"
            onClick={() => {
              api
                .logout()
                .catch(() => undefined)
                .finally(() => setAuthed(false));
            }}
          >
            退出
          </button>
        </div>
      </aside>
      <main className="workspace">
        {page === "slots" ? <SlotsPage onError={showError} /> : null}
        {page === "releases" ? <ReleasesPage onError={showError} /> : null}
        {page === "dismissals" ? <DismissalsPage onError={showError} /> : null}
        {page === "audit" ? <AuditPage onError={showError} /> : null}
      </main>
      <Toast message={toast} />
    </div>
  );
}
