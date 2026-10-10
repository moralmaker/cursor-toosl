import { useEffect, useState } from "react";
import { api, type CallDetail } from "../../shared/api";
import { appStore } from "../../shared/store/appStore";
import { ContentPanel } from "../../shell/ContentPanel";
import controls from "../../shared/ui/Controls.module.scss";
import { CallDetails } from "./CallDetails";
import details from "./CallDetails.module.scss";
import { CallStatus } from "./CallTable";

export function CallDrawer({ callId, onClose }: { callId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<CallDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    void api.call(callId).then((value) => {
      if (!cancelled) setDetail(value);
    }).catch((cause) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => { cancelled = true; };
  }, [callId]);

  const body = error
    ? <p className={details.notice} role="alert">{t("无法加载调用详情")}：{error}</p>
    : detail
      ? <CallDetails detail={detail} compact />
      : <p className={details.notice}>{t("正在加载调用详情…")}</p>;

  return <ContentPanel
    open
    variant="drawer"
    title={detail?.call.display_name ?? t("调用详情")}
    extra={detail ? <CallStatus status={detail.call.status} /> : undefined}
    onClose={onClose}
    footer={<button type="button" className={controls.secondary} onClick={() => void appStore.openCallDetails(callId)}>{t("在新窗口打开")}</button>}
  >
    {body}
  </ContentPanel>;
}
