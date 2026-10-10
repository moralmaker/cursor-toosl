import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import KeepAliveRouteOutlet from "keepalive-for-react-router";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { api } from "../shared/api";
import { CommandPalette } from "./CommandPalette";
import { ContentOverlayHost, peekLeaveDiscard } from "./contentOverlay";
import { AdMenu } from "./ads/AdMenu";
import { FloatingAd } from "./ads/FloatingAd";
import { loadCachedAds, saveCachedAds } from "./ads/cache";
import { AdActionType, adDismissible, type AdAction, type AdSlot } from "./ads/types";
import { PageLayout } from "./layout/PageLayout";
import { Card } from "../shared/ui/Card";
import { ConfirmDialog } from "../shared/ui/ConfirmDialog";
import controls from "../shared/ui/Controls.module.scss";
import { Icon } from "../shared/ui/Icon";
import { TooltipTrigger } from "../shared/ui/TooltipTrigger";
import { refreshIcon } from "../shared/ui/icons";
import { solarNav } from "../shared/ui/solarNav";
import { desktopPlatform } from "../shared/native/platform";
import { formatShortcut, getShortcuts, isShortcutRecording, shortcutMatches, useShortcuts, type ShortcutId } from "./shortcuts";
import { useMessage } from "../shared/ui/message";
import { VirtualList } from "../shared/virtual/VirtualList";
import { useI18n } from "../i18n/store";
import { appStore, useAppStore } from "../shared/store/appStore";
import { useUpdateStore } from "../shared/store/updateStore";
import logoUrl from "../../src-tauri/icons/128x128.png";
import styles from "./AppLayout.module.scss";
import { PageActionsTarget } from "./PageActions";

type MenuItem = { path: string; label: string; shortcutId: ShortcutId; icon: keyof typeof solarNav };

const keptAlivePages = ["/", "/calls", "/settings", "/harness/cursor", "/plugins"];

function withCollapsedTip(collapsed: boolean, label: string, node: ReactElement<{ "aria-describedby"?: string }>) {
  return collapsed ? <TooltipTrigger label={label} placement="right">{node}</TooltipTrigger> : node;
}
const readAdStorageKey = "cursor-tools:read-ad-ids";
const dismissedAdStorageKey = "cursor-tools:dismissed-ad-ids";
const tutorialReadStorageKey = "cursor-tools:tutorial-read";
const tutorialUrl = "https://docs.susuan.ai";

function loadStoredAdIds(key: string): Set<string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

export function AppLayout() {
  const { busy, cursorHarness, ports } = useAppStore();
  const { availableVersion } = useUpdateStore();
  const { locale } = useI18n();
  const shortcuts = useShortcuts();
  const macShortcuts = desktopPlatform() === "macos";
  const message = useMessage();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("cursor-tools.sidebar") === "collapsed"; } catch { return false; }
  });
  const [statusOpen, setStatusOpen] = useState(false);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [pageMotion, setPageMotion] = useState(false);
  const [leftActionTarget, setLeftActionTarget] = useState<HTMLDivElement | null>(null);
  const [rightActionTarget, setRightActionTarget] = useState<HTMLDivElement | null>(null);
  const [ads, setAds] = useState<AdSlot[]>(() => loadCachedAds());
  const [activeAd, setActiveAd] = useState<AdSlot | null>(null);
  const [dismissCandidate, setDismissCandidate] = useState<AdSlot | null>(null);
  const [dismissReason, setDismissReason] = useState("");
  const [confirmTutorial, setConfirmTutorial] = useState(false);
  const [readAdIds, setReadAdIds] = useState(() => loadStoredAdIds(readAdStorageKey));
  const [dismissedAdIds, setDismissedAdIds] = useState(() => loadStoredAdIds(dismissedAdStorageKey));
  const dismissedAdIdsRef = useRef(dismissedAdIds);
  dismissedAdIdsRef.current = dismissedAdIds;
  const adTriggers = useRef(new Map<string, HTMLButtonElement>());
  const closeAd = useCallback(() => setActiveAd(null), []);
  const visibleAds = ads.filter((ad) => ad.enabled && ad.placement === "menu" && !(adDismissible(ad) && dismissedAdIds.has(ad.id)));
  const menuItems: MenuItem[] = [
    { path: "/", label: t("概览"), shortcutId: "overview", icon: "chart-2" },
    { path: "/calls", label: t("调用"), shortcutId: "calls", icon: "history-2" },
    { path: "/harness/cursor", label: "Cursor", shortcutId: "cursor", icon: "cpu-bolt" },
    { path: "/plugins", label: t("插件"), shortcutId: "plugins", icon: "widget-5" },
  ];
  const settingsActive = location.pathname === "/settings";
  const taken = Boolean(cursorHarness?.settings_applied);
  const statusLabel = cursorHarness?.ca !== "ready"
    ? t("未就绪")
    : taken
      ? t("已接管")
      : t("未接管");

  const openTutorial = useCallback(() => {
    setConfirmTutorial(false);
    void api.openExternalUrl(tutorialUrl)
      .then(() => {
        try { localStorage.setItem(tutorialReadStorageKey, "true"); } catch { /* preference is optional */ }
      })
      .catch((cause) => message(cause instanceof Error ? cause.message : String(cause)));
  }, [message]);

  useEffect(() => {
    document.documentElement.dataset.sidebar = collapsed ? "collapsed" : "expanded";
    try { localStorage.setItem("cursor-tools.sidebar", collapsed ? "collapsed" : "expanded"); } catch { /* preference stays in memory */ }
  }, [collapsed]);

  useEffect(() => {
    setPageMotion(true);
    const timer = window.setTimeout(() => setPageMotion(false), 180);
    return () => window.clearTimeout(timer);
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isShortcutRecording()) return;
      const current = getShortcuts();
      const routes: Array<[ShortcutId, string]> = [
        ["overview", "/"],
        ["calls", "/calls"],
        ["cursor", "/harness/cursor"],
        ["plugins", "/plugins"],
        ["settings", "/settings"],
      ];
      const route = routes.find(([id]) => shortcutMatches(event, current[id]));
      if (route) {
        event.preventDefault();
        if (peekLeaveDiscard()) setPendingPath(route[1]);
        else navigate(route[1]);
      } else if (shortcutMatches(event, current.sidebar)) {
        event.preventDefault();
        setCollapsed((value) => !value);
      } else if (shortcutMatches(event, current.palette)) {
        event.preventDefault();
        setCommandsOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  useEffect(() => {
    let disposed = false;
    let pending = false;
    let lastRequestedAt = 0;
    setAds(loadCachedAds());
    setActiveAd(null);
    const refreshAds = () => {
      const now = Date.now();
      if (pending || now - lastRequestedAt < 10_000) return;
      pending = true;
      lastRequestedAt = now;
      void api.ads(dismissedAdIdsRef.current, locale)
        .then((runtime) => {
          saveCachedAds(runtime.slots);
          if (disposed) return;
          setAds(runtime.slots);
          setActiveAd((current) => current
            ? runtime.slots.find((ad) => ad.id === current.id) ?? null
            : null);
        })
        .catch(() => {
          // Keep the current ads and local cache available when refreshing fails.
        })
        .finally(() => { pending = false; });
    };
    const refreshVisibleAds = () => {
      if (document.visibilityState === "visible") refreshAds();
    };

    refreshAds();
    window.addEventListener("focus", refreshAds);
    document.addEventListener("visibilitychange", refreshVisibleAds);
    return () => {
      disposed = true;
      window.removeEventListener("focus", refreshAds);
      document.removeEventListener("visibilitychange", refreshVisibleAds);
    };
  }, [locale]);

  const openAd = useCallback((ad: AdSlot) => {
    setReadAdIds((current) => {
      if (current.has(ad.id)) return current;
      const next = new Set(current).add(ad.id);
      try {
        localStorage.setItem(readAdStorageKey, JSON.stringify([...next]));
      } catch {
        // Read state remains valid for the current session when storage is unavailable.
      }
      return next;
    });
    setActiveAd((current) => current?.id === ad.id ? null : ad);
  }, []);

  const performAdAction = useCallback((action: AdAction) => {
    if (action.type !== AdActionType.OpenBrowser) return;
    void api.openExternalUrl(action.url)
      .catch((cause) => message(cause instanceof Error ? cause.message : String(cause)));
  }, [message]);

  const openDismissAd = useCallback((ad: AdSlot) => {
    setDismissReason("");
    setDismissCandidate(ad);
  }, []);

  const closeDismissAd = useCallback(() => {
    setDismissCandidate(null);
    setDismissReason("");
  }, []);

  const dismissAd = useCallback(() => {
    if (!dismissCandidate) return;
    const dismissedId = dismissCandidate.id;
    const reason = dismissReason.trim();
    setDismissedAdIds((current) => {
      const next = new Set(current).add(dismissedId);
      try {
        localStorage.setItem(dismissedAdStorageKey, JSON.stringify([...next]));
      } catch {
        // Dismissed state remains valid for the current session when storage is unavailable.
      }
      return next;
    });
    setActiveAd((current) => current?.id === dismissedId ? null : current);
    setDismissCandidate(null);
    setDismissReason("");
    void api.dismissAd(dismissedId, reason).catch(() => {
      // Dismissal is intentionally fire-and-forget so reporting never blocks the UI.
    });
  }, [dismissCandidate, dismissReason]);

  return <PageLayout className={styles.root}>
    <Card as="aside" className={styles.menuCard}>
      <nav className={styles.navigation} aria-label={t("主菜单")} data-collapsed={collapsed || undefined} onClickCapture={(event) => {
        const link = (event.target as HTMLElement).closest("a");
        if (!link || !peekLeaveDiscard()) return;
        event.preventDefault();
        event.stopPropagation();
        const hash = new URL(link.href).hash.replace(/^#/, "");
        setPendingPath(hash || "/");
      }}>
        <div className={styles.brand}>
          <img src={logoUrl} alt="" />
          <span>Cursor Tools</span>
        </div>
        <button
          type="button"
          className={styles.capsule}
          aria-expanded={statusOpen}
          onClick={() => setStatusOpen((value) => !value)}
        >
          <i className={styles.statusDot} data-state={cursorHarness?.ca !== "ready" ? "bad" : taken ? "ok" : "warn"} />
          <span>{statusLabel}</span>
        </button>
        {statusOpen && <div className={styles.statusPanel}>
          <p>{t("证书状态")}：{cursorHarness?.ca === "ready" ? t("已信任") : t("未就绪")}</p>
          <p>{cursorHarness?.proxy_url ?? `127.0.0.1:${ports.proxy_port}`}</p>
          <button type="button" onClick={() => {
            const value = cursorHarness?.proxy_url ?? `127.0.0.1:${ports.proxy_port}`;
            void navigator.clipboard.writeText(value).then(() => message(t("已复制"))).catch(() => message(t("复制失败")));
          }}>{t("复制代理地址")}</button>
        </div>}
        <VirtualList
          items={menuItems}
          itemKey={(item) => item.path}
          estimatedItemHeight={36}
          itemGap={3}
          className={`${styles.navigationList} scroll-shadow-bottom`}
        >
          {(item) => {
            const active = item.path === "/" ? location.pathname === "/" : location.pathname.startsWith(item.path);
            const shortcut = formatShortcut(shortcuts[item.shortcutId], macShortcuts);
            return <div className={styles.navigationRow} key={item.path}>
              {withCollapsedTip(collapsed, shortcut ? `${item.label} ${shortcut}` : item.label,
                <NavLink to={item.path} end={item.path === "/"}>
                  <Icon icon={active ? solarNav[item.icon].bold : solarNav[item.icon].line} size="1.3em" />
                  <span>{item.label}</span>
                  {shortcut && <kbd>{shortcut}</kbd>}
                  {item.path === "/harness/cursor" && cursorHarness && <span
                    className={styles.menuStatusTag}
                    data-taken={cursorHarness.settings_applied || undefined}
                  >
                    {cursorHarness.settings_applied ? t("已接管") : t("未接管")}
                  </span>}
                </NavLink>,
              )}
            </div>;
          }}
        </VirtualList>
        <AdMenu ads={visibleAds} activeAdId={activeAd?.id} dismissingAdId={dismissCandidate?.id} readAdIds={readAdIds} triggerRefs={adTriggers} onOpen={openAd} onDismiss={openDismissAd} />
        <div className={styles.navigationRow}>
          {withCollapsedTip(collapsed, formatShortcut(shortcuts.settings, macShortcuts) ? `${t("设置")} ${formatShortcut(shortcuts.settings, macShortcuts)}` : t("设置"),
            <NavLink to="/settings">
              <Icon icon={settingsActive ? solarNav.settings.bold : solarNav.settings.line} size="1.3em" />
              <span>{t("设置")}</span>
              {formatShortcut(shortcuts.settings, macShortcuts) && <kbd>{formatShortcut(shortcuts.settings, macShortcuts)}</kbd>}
              {availableVersion && <span className={styles.menuIndicatorDot} aria-hidden="true" />}
            </NavLink>,
          )}
        </div>
      </nav>
    </Card>
    {activeAd && <FloatingAd ad={activeAd} trigger={adTriggers.current.get(activeAd.id) ?? null} onClose={closeAd} onAction={performAdAction} />}
    <ConfirmDialog
      id="open-tutorial-dialog"
      open={confirmTutorial}
      title={t("打开使用教程？")}
      cancelLabel={t("取消")}
      confirmLabel={t("打开教程")}
      onCancel={() => setConfirmTutorial(false)}
      onConfirm={openTutorial}
    >
      <p>{t("将在系统浏览器中打开使用教程，是否继续？")}</p>
    </ConfirmDialog>
    <ConfirmDialog
      id="dismiss-ad-dialog"
      open={dismissCandidate !== null}
      title={t("不再显示此广告")}
      cancelLabel={t("取消")}
      confirmLabel={t("确认")}
      onCancel={closeDismissAd}
      onConfirm={() => void dismissAd()}
    >
      <p>{t("你确认不想再看到此广告吗？")}</p>
      <label className={styles.dismissReason}>
        <span>{t("原因（可选）")}</span>
        <textarea
          value={dismissReason}
          maxLength={2000}
          rows={4}
          placeholder={t("可以告诉我们原因")}
          onChange={(event) => setDismissReason(event.target.value)}
        />
      </label>
    </ConfirmDialog>
    <ConfirmDialog
      open={pendingPath !== null}
      title={t("放弃未保存的修改？")}
      cancelLabel={t("继续编辑")}
      confirmLabel={t("放弃")}
      onCancel={() => setPendingPath(null)}
      onConfirm={() => {
        peekLeaveDiscard()?.();
        if (pendingPath) navigate(pendingPath);
        setPendingPath(null);
      }}
    >
      <p>{t("模型编辑尚未保存，离开后这些修改会丢失。")}</p>
    </ConfirmDialog>
    <main className={styles.content}>
      <ContentOverlayHost className={styles.overlayHost}>
      <div className={styles.actionRegion}>
        <Card className={styles.actions}>
          <div ref={setLeftActionTarget} className={styles.pageActions} />
          {location.pathname !== "/" && <TooltipTrigger label={t("刷新")}><button className={controls.iconButton} aria-label={t("刷新")} disabled={busy} onClick={() => void appStore.refresh()}>
            <Icon className={busy ? controls.spin : ""} icon={refreshIcon} size="1.1em" />
          </button></TooltipTrigger>}
          <div ref={setRightActionTarget} className={styles.pageActions} />
        </Card>
      </div>
      <PageActionsTarget.Provider value={{ left: leftActionTarget, right: rightActionTarget }}>
        <div className={pageMotion ? `${styles.pageFrame} ${styles.pageIn}` : styles.pageFrame}>
        <KeepAliveRouteOutlet
          activeCacheKey={location.pathname}
          include={keptAlivePages}
          max={keptAlivePages.length}
          enableActivity
          containerClassName={styles.keepAliveContainer}
          cacheNodeClassName={styles.keepAlivePage}
        />
        </div>
      </PageActionsTarget.Provider>
      </ContentOverlayHost>
      {commandsOpen && <CommandPalette onClose={() => setCommandsOpen(false)} onNavigate={(path) => {
        if (peekLeaveDiscard()) setPendingPath(path);
        else navigate(path);
      }} />}
    </main>
  </PageLayout>;
}
