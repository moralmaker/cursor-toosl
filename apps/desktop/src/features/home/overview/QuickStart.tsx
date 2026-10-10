import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../shared/api";
import { appStore, useAppStore } from "../../../shared/store/appStore";
import { useMessage } from "../../../shared/ui/message";
import styles from "./QuickStart.module.scss";

const DISMISS_KEY = "cursor-tools.quickstart.dismissed";
const TESTED_KEY = "cursor-tools.quickstart.tested";

const stepIds = ["ca", "takeover", "model", "test", "restart"] as const;
type StepId = typeof stepIds[number];

function errorText(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}

export function useQuickStart() {
  const { models, overview, cursorHarness, plugins, cursorBusy } = useAppStore();
  const navigate = useNavigate();
  const message = useMessage();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === "1");
  const [tested, setTested] = useState(() => localStorage.getItem(TESTED_KEY) === "1");
  const [pending, setPending] = useState<StepId | null>(null);
  const hasModels = models.length > 0 || plugins.some((plugin) => plugin.providers.some((provider) => provider.configured));
  const done: Record<StepId, boolean> = {
    ca: cursorHarness?.ca === "ready",
    takeover: Boolean(cursorHarness?.settings_applied),
    model: hasModels,
    test: tested || overview.metrics.successful_calls > 0,
    restart: dismissed,
  };

  const openCaTerminal = async (command: string) => {
    try { await api.copyCursorText(command); } catch { /* 浏览器预览没有系统剪贴板 */ }
    await api.openCursorCaInstallTerminal(command);
    message(t("已打开终端，完成系统授权后回到这里"));
  };

  const run = async (id: StepId) => {
    if (pending) return;
    if (id === "ca") {
      if (done.ca) return;
      setPending(id);
      try {
        const current = cursorHarness?.ca === "untrusted" ? cursorHarness : null;
        const status = current?.ca_install_command ? current : await appStore.initializeCursorCa();
        if (status?.ca === "ready") return;
        if (status?.ca_install_command) await openCaTerminal(status.ca_install_command);
      } catch (cause) {
        message(errorText(cause));
      } finally {
        setPending(null);
      }
      return;
    }
    if (id === "takeover") {
      if (done.takeover) return;
      setPending(id);
      try { await appStore.setCursorEnabled(true); }
      finally { setPending(null); }
      return;
    }
    if (id === "model") {
      navigate("/harness/cursor");
      return;
    }
    if (id === "test") {
      const model = models[0];
      if (!model) {
        navigate("/harness/cursor");
        return;
      }
      setPending(id);
      try {
        const result = await api.testModel(model.model_hash, crypto.randomUUID());
        localStorage.setItem(TESTED_KEY, "1");
        setTested(true);
        message(t("模型 {model} 连通性测试成功（{duration} ms）", { model: model.display_name, duration: result.duration_ms }));
      } catch (cause) {
        message(errorText(cause));
      } finally {
        setPending(null);
      }
      return;
    }
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
    message(t("请完全退出并重新打开 Cursor，再新开对话"));
  };

  return {
    visible: stepIds.some((id) => !done[id]),
    done,
    pending,
    busy: cursorBusy || pending !== null,
    run,
  };
}

export function QuickStart({ done, pending, busy, onRun }: {
  done: Record<StepId, boolean>;
  pending: StepId | null;
  busy: boolean;
  onRun: (id: StepId) => void;
}) {
  const steps: Array<{ id: StepId; title: string }> = [
    { id: "ca", title: t("初始化 CA") },
    { id: "takeover", title: t("开启接管") },
    { id: "model", title: t("添加模型") },
    { id: "test", title: t("测试连通") },
    { id: "restart", title: t("重启 Cursor") },
  ];
  const current = steps.find((step) => !done[step.id])?.id;
  return <div className={styles.steps}>
    {steps.map((step) => <button
      key={step.id}
      type="button"
      className={done[step.id] ? styles.done : step.id === current ? styles.current : styles.step}
      disabled={busy}
      onClick={() => onRun(step.id)}
    >
      <b>{step.title}</b>
      <span>{done[step.id] ? t("已完成") : pending === step.id ? t("处理中…") : t("去完成")}</span>
    </button>)}
  </div>;
}
