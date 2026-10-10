import { useEffect, useState } from "react";
import { api } from "../../shared/api";
import { currentAppVersion, hasNativeAppLifecycle } from "../../shared/native/appLifecycle";
import { formatUpdateProgress, updateStore, useUpdateStore } from "../../shared/store/updateStore";
import { Button } from "../../shared/ui/Button";
import { useMessage } from "../../shared/ui/message";
import { SettingRow, SettingsGroup } from "./SettingsGroup";
import styles from "./AboutSettingsCard.module.scss";

const STAR_KEY = "cursor-tools:about:starPromptDismissed";
const SITE = "https://ops.susuan.ai/download/";
const CHANGELOG = "https://ops.susuan.ai/download/changelog/";
const GITHUB = "https://github.com/moralmaker/cursor-toosl";

export function AboutSettingsCard() {
  const message = useMessage();
  const native = hasNativeAppLifecycle();
  const { availableVersion, checking, installing, installProgress } = useUpdateStore();
  const progressLabel = formatUpdateProgress(installProgress);
  const [version, setVersion] = useState("…");
  const [starHidden, setStarHidden] = useState(() => {
    try { return localStorage.getItem(STAR_KEY) === "1"; } catch { return false; }
  });

  useEffect(() => {
    let disposed = false;
    void currentAppVersion().then((next) => { if (!disposed) setVersion(next); });
    return () => { disposed = true; };
  }, []);

  const checkUpdate = async () => {
    try {
      const nextVersion = await updateStore.check();
      message(nextVersion ? t("发现新版本 {version}", { version: nextVersion }) : t("当前已是最新版本"));
    } catch (cause) {
      message(t("检查更新失败：{error}", { error: cause instanceof Error ? cause.message : String(cause) }));
    }
  };

  const updateNow = async () => {
    try {
      await updateStore.install();
    } catch (cause) {
      message(t("安装更新失败：{error}", { error: cause instanceof Error ? cause.message : String(cause) }));
    }
  };

  const open = (url: string) => {
    void api.openExternalUrl(url).catch((cause) => message(cause instanceof Error ? cause.message : String(cause)));
  };

  const hideStar = () => {
    setStarHidden(true);
    try { localStorage.setItem(STAR_KEY, "1"); } catch { /* keep hidden for this session */ }
  };

  return <>
    <SettingsGroup title={t("关于")}>
      <SettingRow
        title="Cursor TOOLS"
        description={availableVersion
          ? t("版本 {version} 可以安装", { version: availableVersion })
          : t("当前版本 {version}", { version })}
      >
        {availableVersion
          ? <Button size="small" variant="primary" disabled={installing} onClick={() => void updateNow()}>
              {installing
                ? installProgress?.phase === "install"
                  ? t("正在安装…")
                  : progressLabel
                    ? t("下载中 {progress}", { progress: progressLabel })
                    : t("下载中…")
                : t("下载并安装")}
              <span className={styles.updateDot} aria-hidden="true" />
            </Button>
          : <Button size="small" disabled={!native || checking} onClick={() => void checkUpdate()}>
              {checking ? t("检查中…") : t("检查更新")}
            </Button>}
      </SettingRow>
      <SettingRow title={t("链接")} description={t("官网、更新日志和项目仓库。")}>
        <Button size="small" onClick={() => open(SITE)}>{t("官网")}</Button>
        <Button size="small" onClick={() => open(CHANGELOG)}>{t("更新日志")}</Button>
        <Button size="small" onClick={() => open(GITHUB)}>GitHub</Button>
      </SettingRow>
      <SettingRow title={t("近期更新")} description={t("查看每个版本的更新说明。")}>
        <Button size="small" onClick={() => open(`${CHANGELOG}${version === "…" ? "" : `${version}/`}`)}>{t("查看近期更新")}</Button>
      </SettingRow>
    </SettingsGroup>
    {!starHidden && <div className={styles.star}>
      <p>{t("如果 Cursor TOOLS 帮到了你，欢迎去 GitHub 标一颗星。")}</p>
      <Button size="small" onClick={() => open(GITHUB)}>{t("在 GitHub 上标星")}</Button>
      <button type="button" className={styles.close} aria-label={t("关闭")} onClick={hideStar}>{t("关闭")}</button>
    </div>}
  </>;
}
