import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, type CallDetail } from "../../shared/api";
import { CallDetails } from "./CallDetails";
import details from "./CallDetails.module.scss";
import { CallStatus } from "./CallTable";
import styles from "./CallDetailsPage.module.scss";
import { ScrollableContent } from "../../shared/virtual/ScrollableContent";

export function CallDetailsPage() {
  const { callId = "" } = useParams();
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
    return () => {
      cancelled = true;
    };
  }, [callId]);

  const content = error
    ? <p className={details.notice} role="alert">{t("无法加载调用详情")}：{error}</p>
    : detail
      ? <CallDetails detail={detail} />
      : <p className={details.notice}>{t("正在加载调用详情…")}</p>;

  return <main className={styles.root}>
    <ScrollableContent className={styles.scroller} contentClassName={styles.content}>
      <header className={styles.header}>
        <h1>{detail?.call.display_name ?? t("调用详情")}</h1>
        {detail && <CallStatus status={detail.call.status} />}
      </header>
      {content}
    </ScrollableContent>
  </main>;
}
