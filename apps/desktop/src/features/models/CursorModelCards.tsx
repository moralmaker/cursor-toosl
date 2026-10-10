import type { IconifyIcon } from "@iconify/react/offline";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Sortable from "sortablejs";
import type { Model, PluginModelDescriptor } from "../../shared/api";
import { ActionMenu } from "../../shared/ui/ActionMenu";
import { Card } from "../../shared/ui/Card";
import { Icon } from "../../shared/ui/Icon";
import { chevronDownIcon, chevronRightIcon, claudeIcon, dragIcon, editIcon, openAiIcon } from "../../shared/ui/icons";
import { TruncatedButton } from "../../shared/ui/TruncatedButton";
import { CursorModelTestResult, type CursorModelTestState } from "./CursorModelTestResult";
import styles from "./CursorSettings.module.scss";

export type CursorModelGrouping = "flat" | "provider" | "type";

export type CursorModelGroup = {
  key: string;
  label: string;
  icon?: IconifyIcon;
  models: Model[];
};

type CursorModelCardsProps = {
  models: Model[];
  pluginModels: PluginModelDescriptor[];
  grouping: CursorModelGrouping;
  disabled: boolean;
  testingModelHashes: Set<string>;
  testResults: Map<string, CursorModelTestState>;
  onTest: (model: Model) => void;
  onEdit: (model: Model) => void;
  onDuplicate: (model: Model) => void;
  onDelete: (model: Model) => void;
  onTestPluginModel: (model: PluginModelDescriptor) => void;
  onPluginSettings: (model: PluginModelDescriptor) => void;
  onReorder: (modelHashes: string[]) => void;
  onGroupSettings: (group: CursorModelGroup) => void;
};

type ModelGridProps = Omit<CursorModelCardsProps, "grouping" | "pluginModels" | "onTestPluginModel" | "onPluginSettings"> & {
  sortable: boolean;
};

export function cursorModelGroups(models: Model[], grouping: Exclude<CursorModelGrouping, "flat">): CursorModelGroup[] {
  const groups = new Map<string, CursorModelGroup>();
  for (const model of models) {
    const descriptor = grouping === "provider" ? providerGroup(model) : typeGroup(model);
    const group = groups.get(descriptor.key);
    if (group) {
      group.models.push(model);
    } else {
      groups.set(descriptor.key, { ...descriptor, models: [model] });
    }
  }
  return [...groups.values()];
}

export function CursorModelCards(props: CursorModelCardsProps) {
  const builtins = props.grouping === "flat"
    ? <ModelGrid {...props} sortable />
    : <div className={styles.modelGroups}>
      {cursorModelGroups(props.models, props.grouping).map((group) => <CollapsibleGroup
        key={group.key}
        label={group.label}
        icon={group.icon}
        defaultOpen={false}
        onSettings={props.grouping === "provider" ? () => props.onGroupSettings(group) : undefined}
      >
        {group.models.map((model) => <ModelListRow
          key={model.model_hash}
          model={model}
          disabled={props.disabled}
          testing={props.testingModelHashes.has(model.model_hash)}
          result={props.testResults.get(model.model_hash)}
          onTest={() => props.onTest(model)}
          onEdit={() => props.onEdit(model)}
          onDuplicate={() => props.onDuplicate(model)}
          onDelete={() => props.onDelete(model)}
        />)}
      </CollapsibleGroup>)}
    </div>;
  return <div className={styles.modelGroups}>
    {builtins}
    {pluginGroups(props.pluginModels).map((group) => <CollapsibleGroup
      key={`${props.grouping}:${group.pluginId}`}
      label={group.pluginName}
      iconSrc={group.icon}
      defaultOpen={props.grouping === "flat"}
    >
      {group.models.map((model) => <PluginModelRow
        key={model.id}
        model={model}
        disabled={props.disabled}
        testing={props.testingModelHashes.has(model.id)}
        result={props.testResults.get(model.id)}
        onTest={() => props.onTestPluginModel(model)}
        onSettings={() => props.onPluginSettings(model)}
      />)}
    </CollapsibleGroup>)}
  </div>;
}

function pluginGroups(models: PluginModelDescriptor[]) {
  const groups: { pluginId: string; pluginName: string; icon: string; models: PluginModelDescriptor[] }[] = [];
  for (const model of models) {
    let group = groups.find((candidate) => candidate.pluginId === model.pluginId);
    if (!group) {
      group = { pluginId: model.pluginId, pluginName: model.pluginName, icon: model.icon, models: [] };
      groups.push(group);
    }
    group.models.push(model);
  }
  return groups;
}

function CollapsibleGroup({ label, icon, iconSrc, defaultOpen = true, onSettings, children }: {
  label: string;
  icon?: IconifyIcon;
  iconSrc?: string;
  defaultOpen?: boolean;
  onSettings?: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return <Card className={styles.groupCard}>
    <div className={styles.groupHeader}>
      <button
        type="button"
        className={styles.groupToggle}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={styles.brand}>
          {iconSrc ? <Icon src={iconSrc} size="1.15em" /> : icon ? <Icon icon={icon} size="1.15em" /> : label.slice(0, 1)}
        </span>
        <span className={styles.groupLabel}>{label}</span>
      </button>
      {onSettings && <button type="button" className={styles.groupSettings} onClick={onSettings}>
        <Icon icon={editIcon} size="1em" />
        {t("分组设置")}
      </button>}
      <button
        type="button"
        className={styles.groupChevron}
        tabIndex={-1}
        aria-hidden="true"
        onClick={() => setOpen((current) => !current)}
      >
        <Icon icon={open ? chevronDownIcon : chevronRightIcon} size="1em" />
      </button>
    </div>
    {open && <div className={styles.modelList}>{children}</div>}
  </Card>;
}

function ModelListRow({ model, disabled, testing, result, sortable, onTest, onEdit, onDuplicate, onDelete }: {
  model: Model;
  disabled: boolean;
  testing: boolean;
  result: CursorModelTestState | undefined;
  sortable?: boolean;
  onTest: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const protocol = protocolChip(model);
  return <div className={sortable ? `${styles.modelRow} ${styles.sortable}` : styles.modelRow} data-model-hash={model.model_hash}>
    {sortable && <button type="button" className={styles.sortHandle} disabled={disabled} aria-label={t("拖动排序")} onClick={(event) => event.stopPropagation()}>
      <Icon icon={dragIcon} size="1.1em" />
    </button>}
    <span className={styles.brand}><Icon icon={model.type === "anthropic" ? claudeIcon : openAiIcon} size="1.15em" /></span>
    <div className={styles.modelRowName}>
      <span className={styles.modelRowTitle}>
        <span className={styles.modelRowNameText}>{model.display_name}</span>
        <span className={styles.protocol} data-protocol={protocol}>{protocol === "anthropic" ? "Anthropic" : protocol === "chat" ? "Chat" : "Responses"}</span>
      </span>
      <span className={styles.modelRowModelId}>{model.model_id} · {providerDomain(model.base_url)} · {model.price_source === "custom" ? t("自定义价格") : model.price_source === "official" ? t("官方价") : t("未定价")}</span>
      {testing || result
        ? <CursorModelTestResult compact state={result} testing={testing} />
        : <span className={styles.untested}>{t("未测试")}</span>}
    </div>
    <div className={styles.modelCardActions}>
      <TruncatedButton size="small" disabled={disabled && !testing} label={testing ? t("取消测试") : t("测试")} onClick={onTest} />
      <TruncatedButton size="small" disabled={disabled} label={t("编辑")} onClick={onEdit} />
      <ActionMenu
        label={t("更多")}
        disabled={disabled}
        items={[
          { id: "duplicate", label: t("复制"), onSelect: onDuplicate },
          { id: "delete", label: t("删除"), onSelect: onDelete },
        ]}
      />
    </div>
  </div>;
}

function PluginModelRow({ model, disabled, testing, result, onTest, onSettings }: {
  model: PluginModelDescriptor;
  disabled: boolean;
  testing: boolean;
  result: CursorModelTestState | undefined;
  onTest: () => void;
  onSettings: () => void;
}) {
  return <div className={styles.modelRow}>
    <span className={styles.brand}>{model.icon ? <Icon src={model.icon} size="1.15em" /> : model.displayName.slice(0, 1)}</span>
    <div className={styles.modelRowName}>
      <span className={styles.modelRowNameText}>{model.displayName}</span>
      <span className={styles.modelRowModelId}>{model.modelId}</span>
      {testing || result
        ? <CursorModelTestResult compact state={result} testing={testing} />
        : <span className={styles.untested}>{t("未测试")}</span>}
    </div>
    <div className={styles.modelCardActions}>
      <TruncatedButton size="small" disabled={disabled && !testing} label={testing ? t("取消测试") : t("测试")} onClick={onTest} />
      <TruncatedButton size="small" disabled={disabled} label={t("设置")} onClick={onSettings} />
    </div>
  </div>;
}

function ModelGrid({
  models,
  sortable: sortableEnabled,
  disabled,
  testingModelHashes,
  testResults,
  onTest,
  onEdit,
  onDuplicate,
  onDelete,
  onReorder,
}: ModelGridProps) {
  const grid = useRef<HTMLDivElement>(null);
  const sortable = useRef<Sortable | null>(null);
  const currentModels = useRef(models);
  const reorder = useRef(onReorder);
  currentModels.current = models;
  reorder.current = onReorder;

  useEffect(() => {
    if (!sortableEnabled || !grid.current) return;
    sortable.current = Sortable.create(grid.current, {
      animation: 160,
      dataIdAttr: "data-model-hash",
      draggable: `.${styles.modelRow}`,
      handle: `.${styles.sortHandle}`,
      ghostClass: styles.sortGhost,
      chosenClass: styles.sortChosen,
      dragClass: styles.sortDragging,
      forceFallback: true,
      fallbackOnBody: true,
      fallbackTolerance: 3,
      onEnd: (event) => {
        const oldIndex = event.oldDraggableIndex ?? event.oldIndex;
        const newIndex = event.newDraggableIndex ?? event.newIndex;
        if (typeof oldIndex !== "number"
          || typeof newIndex !== "number"
          || oldIndex === newIndex) {
          sortable.current?.sort(currentModels.current.map((model) => model.model_hash), false);
          return;
        }
        const reordered = currentModels.current.slice();
        const [moved] = reordered.splice(oldIndex, 1);
        if (!moved || newIndex < 0 || newIndex > reordered.length) {
          sortable.current?.sort(currentModels.current.map((model) => model.model_hash), false);
          return;
        }
        reordered.splice(newIndex, 0, moved);
        reorder.current(reordered.map((model) => model.model_hash));
      },
    });
    return () => {
      sortable.current?.destroy();
      sortable.current = null;
    };
  }, [sortableEnabled]);

  useEffect(() => {
    sortable.current?.option("disabled", disabled);
    sortable.current?.sort(models.map((model) => model.model_hash), false);
  }, [disabled, models]);

  return <Card className={styles.modelListCard}>
    <div ref={grid} className={styles.modelList}>
      {models.map((model) => <ModelListRow
        key={model.model_hash}
        model={model}
        disabled={disabled}
        testing={testingModelHashes.has(model.model_hash)}
        result={testResults.get(model.model_hash)}
        sortable={sortableEnabled}
        onTest={() => onTest(model)}
        onEdit={() => onEdit(model)}
        onDuplicate={() => onDuplicate(model)}
        onDelete={() => onDelete(model)}
      />)}
    </div>
  </Card>;
}

function protocolChip(model: Model) {
  if (model.type === "anthropic") return "anthropic";
  if (model.openai_endpoint === "/v1/chat/completions") return "chat";
  return "responses";
}

function providerGroup(model: Model) {
  const key = providerDomain(model.base_url);
  const label = model.group_name?.trim() || key;
  return { key, label };
}

function providerDomain(baseUrl: string) {
  const value = baseUrl.trim();
  try {
    return new URL(value).hostname.toLowerCase() || value;
  } catch {
    try {
      return new URL(`https://${value}`).hostname.toLowerCase() || value;
    } catch {
      return value;
    }
  }
}

function typeGroup(model: Model) {
  if (model.type === "anthropic") return { key: "anthropic", label: "Anthropic", icon: claudeIcon };
  if (model.openai_endpoint === "/v1/chat/completions") return { key: "openai-chat", label: "OpenAI Chat", icon: openAiIcon };
  return { key: "openai-responses", label: "OpenAI Responses", icon: openAiIcon };
}
