import { useCallback, useEffect, useMemo, useState } from "react";
import { api, pluginText, type CommitSettingsView } from "../../shared/api";
import { useI18n } from "../../i18n/store";
import { useAppStore } from "../../shared/store/appStore";
import { Button } from "../../shared/ui/Button";
import { ModelSelect, type ModelSelectOption } from "../../shared/ui/ModelSelect";
import { claudeIcon, flatColorOrganizationIcon, openAiIcon } from "../../shared/ui/icons";
import { useMessage } from "../../shared/ui/message";
import controls from "../../shared/ui/Controls.module.scss";
import { ContentPanel } from "../../shell/ContentPanel";
import { modelProviderName } from "../../shared/utils/modelProvider";
import { SettingRow, SettingsGroup } from "./SettingsGroup";
import groupStyles from "./SettingsGroup.module.scss";
import styles from "./CommitSettingsCard.module.scss";

function errorText(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}

export function CommitSettingsCard() {
  const { models, plugins } = useAppStore();
  const { locale } = useI18n();
  const message = useMessage();
  const [view, setView] = useState<CommitSettingsView | null>(null);
  const [modelDraft, setModelDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [savingModel, setSavingModel] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptDraft, setPromptDraft] = useState("");
  const [savingPrompt, setSavingPrompt] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        let loaded = await api.commitSettings(locale);
        if (!loaded.prompt.trim() && loaded.prompt_locale !== locale) {
          loaded = await api.setCommitSettings({
            model_id: loaded.model_id,
            prompt: "",
            prompt_locale: locale,
          });
        }
        if (active) {
          setView(loaded);
          setModelDraft(loaded.model_id);
        }
      } catch (cause) {
        if (active) message(errorText(cause));
      }
    })();
    return () => {
      active = false;
    };
  }, [locale, message]);

  const modelOptions = useMemo(() => {
    const options: ModelSelectOption[] = [{ value: "", label: t("直连"), group: "Cursor" }];
    const seen = new Set<string>();
    for (const model of models) {
      seen.add(model.model_hash);
      options.push({
        value: model.model_hash,
        label: model.display_name && model.display_name !== model.model_id
          ? `${model.display_name}（${model.model_id}）`
          : model.display_name || model.model_id,
        group: modelProviderName(model),
        icon: model.type === "anthropic" ? claudeIcon : openAiIcon,
      });
    }
    for (const plugin of plugins) {
      for (const provider of plugin.providers) {
        if (!provider.configured) continue;
        const group = pluginText(provider.displayName, locale) || plugin.name;
        for (const model of provider.models.filter((model) => model.enabled)) {
          seen.add(model.id);
          options.push({
            value: model.id,
            label: model.displayName,
            group,
            iconSrc: model.icon || undefined,
            icon: model.icon ? undefined : flatColorOrganizationIcon,
          });
        }
      }
    }
    if (view?.model_id && !seen.has(view.model_id)) {
      options.push({ value: view.model_id, label: view.model_id, group: "Cursor" });
    }
    return options;
  }, [locale, models, plugins, view]);

  const persist = useCallback(
    async (modelId: string, prompt: string) => {
      if (!view) return null;
      const normalizedPrompt =
        prompt.trim() === view.default_prompt.trim() ? "" : prompt.trim();
      return api.setCommitSettings({
        model_id: modelId,
        prompt: normalizedPrompt,
        prompt_locale: locale,
      });
    },
    [view, locale],
  );

  const editModel = useCallback(() => {
    if (!view) return;
    setModelDraft(view.model_id);
    setEditing(true);
  }, [view]);

  const cancelModelEdit = useCallback(() => {
    setModelDraft(view?.model_id ?? "");
    setEditing(false);
  }, [view]);

  const saveModel = useCallback(async () => {
    if (!view) return;
    setSavingModel(true);
    try {
      const saved = await persist(modelDraft, view.prompt);
      if (saved) {
        setView(saved);
        setModelDraft(saved.model_id);
        setEditing(false);
      }
    } catch (cause) {
      message(errorText(cause));
    } finally {
      setSavingModel(false);
    }
  }, [modelDraft, view, persist, message]);

  const openPrompt = useCallback(() => {
    if (!view) return;
    setPromptDraft(view.prompt || view.default_prompt);
    setPromptOpen(true);
  }, [view]);

  const savePrompt = useCallback(async () => {
    if (!view) return;
    setSavingPrompt(true);
    try {
      const saved = await persist(view.model_id, promptDraft);
      if (saved) setView(saved);
      setPromptOpen(false);
      message(t("提示词设置已保存"));
    } catch (cause) {
      message(errorText(cause));
    } finally {
      setSavingPrompt(false);
    }
  }, [view, promptDraft, persist, message]);

  const resetPrompt = useCallback(() => {
    if (!view) return;
    setPromptDraft(view.default_prompt);
  }, [view]);

  const selectedModelLabel = modelOptions.find((option) => option.value === view?.model_id)?.label
    ?? view?.model_id
    ?? t("加载中…");
  const action = editing ? (
    <div className={groupStyles.actions}>
      <Button size="small" disabled={savingModel} onClick={cancelModelEdit}>{t("取消")}</Button>
      <Button variant="primary" size="small" disabled={savingModel} onClick={() => void saveModel()}>
        {savingModel ? t("保存中…") : t("保存")}
      </Button>
    </div>
  ) : (
    <button type="button" className={groupStyles.textButton} disabled={!view} onClick={editModel}>{t("编辑")}</button>
  );

  return (
    <>
      <SettingsGroup title={t("Commit 提交代码模型设置")} action={action}>
        <SettingRow title={t("生成模型")} description={t("用于生成提交说明，也可以选择直连。")}>
          {editing ? <div className={groupStyles.field}>
            <ModelSelect
              mode="single"
              value={modelDraft}
              options={modelOptions}
              disabled={savingModel}
              label={t("生成模型")}
              onChange={setModelDraft}
            />
          </div> : <span className={groupStyles.value}>{selectedModelLabel}</span>}
        </SettingRow>
        <SettingRow title={t("提示词设置")} description={t("可恢复默认。")}>
          <Button size="small" disabled={!view} onClick={openPrompt}>{t("提示词设置")}</Button>
        </SettingRow>
      </SettingsGroup>

      <ContentPanel
        open={promptOpen}
        title={t("提示词设置")}
        onClose={() => setPromptOpen(false)}
        footer={<>
          <button type="button" className={`${controls.secondary} ${styles.pinStart}`} onClick={resetPrompt}>{t("恢复默认")}</button>
          <button type="button" className={controls.secondary} disabled={savingPrompt} onClick={() => setPromptOpen(false)}>{t("取消")}</button>
          <button type="button" className={controls.primary} disabled={savingPrompt} onClick={() => void savePrompt()}>{savingPrompt ? t("保存中…") : t("保存")}</button>
        </>}
      >
        <textarea
          className={styles.promptEditor}
          value={promptDraft}
          spellCheck={false}
          aria-label={t("提交信息提示词")}
          onChange={(event) => setPromptDraft(event.target.value)}
        />
      </ContentPanel>
    </>
  );
}
