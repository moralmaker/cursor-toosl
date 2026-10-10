import { autoUpdate, computePosition, flip, offset, shift, size } from "@floating-ui/dom";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../../i18n/store";
import { parseTimeInput } from "../../../shared/utils/parseTimeInput";
import { Checkbox } from "../../../shared/ui/Checkbox";
import controls from "../../../shared/ui/Controls.module.scss";
import { Icon } from "../../../shared/ui/Icon";
import { chevronLeftIcon, chevronRightIcon, refreshIcon } from "../../../shared/ui/icons";
import { ModelSelect, type ModelSelectOption } from "../../../shared/ui/ModelSelect";
import { TooltipTrigger } from "../../../shared/ui/TooltipTrigger";
import styles from "./OverviewTimeRangeFilter.module.scss";

export type OverviewRangePreset = "ten-minutes" | "hour" | "today" | "week" | "month" | "custom";

export type OverviewCustomApply = {
  startMs: number;
  endMs: number;
  liveEnd: boolean;
  providers: string[];
  models: string[];
  modelHashes: string[];
};

const DAY = 24 * 60 * 60_000;

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function sameDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function dateValue(ms: number) {
  const date = new Date(ms);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function timeValue(ms: number) {
  const date = new Date(ms);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function withDate(ms: number, value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return ms;
  const base = new Date(ms);
  return new Date(year, month - 1, day, base.getHours(), base.getMinutes()).getTime();
}

function withTime(ms: number, value: string) {
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return ms;
  const base = new Date(ms);
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, minute).getTime();
}

function keepTime(ms: number, day: Date) {
  const base = new Date(ms);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), base.getHours(), base.getMinutes()).getTime();
}

function calendarDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function filteredHashes(options: ModelSelectOption[], providers: string[], models: string[]) {
  const scoped = providers.length === 0 ? options : options.filter((option) => providers.includes(option.group));
  if (models.length === 0) return providers.length === 0 ? [] : scoped.map((option) => option.value);
  const allowed = new Set(scoped.map((option) => option.value));
  return models.filter((id) => allowed.has(id));
}

export function OverviewTimeRangeFilter({ value, customOpen, customStart, customEnd, liveEnd: appliedLiveEnd, modelOptions, selectedProviders, selectedModels, busy, onSelect, onCustomOpenChange, onCustomApply, onRefresh }: {
  value: OverviewRangePreset;
  customOpen: boolean;
  customStart: string;
  customEnd: string;
  liveEnd: boolean;
  modelOptions: ModelSelectOption[];
  selectedProviders: string[];
  selectedModels: string[];
  busy: boolean;
  onSelect: (value: Exclude<OverviewRangePreset, "custom">) => void;
  onCustomOpenChange: (open: boolean) => void;
  onCustomApply: (apply: OverviewCustomApply) => void;
  onRefresh: () => void;
}) {
  const { locale } = useI18n();
  const presets: Array<{ value: Exclude<OverviewRangePreset, "custom">; label: string }> = [
    { value: "hour", label: t("近1小时") },
    { value: "today", label: t("近1自然日") },
    { value: "ten-minutes", label: t("近10分钟") },
    { value: "week", label: t("近一周") },
    { value: "month", label: t("近一个月") },
  ];
  const popoverPresets: Array<{ label: string; range: () => { startMs: number; endMs: number } }> = [
    { label: t("当天"), range: () => ({ startMs: startOfDay(new Date()).getTime(), endMs: Date.now() }) },
    { label: t("近24小时"), range: () => ({ startMs: Date.now() - DAY, endMs: Date.now() }) },
    { label: t("近7天"), range: () => ({ startMs: Date.now() - 7 * DAY, endMs: Date.now() }) },
    { label: t("近14天"), range: () => ({ startMs: Date.now() - 14 * DAY, endMs: Date.now() }) },
    { label: t("近30天"), range: () => ({ startMs: Date.now() - 30 * DAY, endMs: Date.now() }) },
    { label: t("全部"), range: () => ({ startMs: Date.now() - 365 * DAY, endMs: Date.now() }) },
  ];
  const customButton = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const popoverId = useId();
  const [position, setPosition] = useState({ left: 0, top: 0, width: 640, maxHeight: 640 });
  const [draftStart, setDraftStart] = useState(() => Date.now() - 60 * 60_000);
  const [draftEnd, setDraftEnd] = useState(() => Date.now());
  const [liveEnd, setLiveEnd] = useState(false);
  const [activeField, setActiveField] = useState<"start" | "end">("start");
  const [month, setMonth] = useState(() => startOfDay(new Date()));
  const [providers, setProviders] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);

  useLayoutEffect(() => {
    if (!customOpen || !customButton.current || !popover.current) return;
    return autoUpdate(customButton.current, popover.current, () => void computePosition(customButton.current!, popover.current!, {
      placement: "bottom-end",
      middleware: [offset(5), flip({ padding: 10 }), shift({ padding: 10 }), size({
        padding: 10,
        apply: ({ availableWidth, availableHeight }) => setPosition((current) => ({
          ...current,
          width: Math.min(640, availableWidth),
          maxHeight: Math.max(360, availableHeight),
        })),
      })],
    }).then(({ x, y }) => setPosition((current) => ({ ...current, left: x, top: y }))));
  }, [customOpen]);

  useEffect(() => {
    if (!customOpen) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (target instanceof Element && target.closest("[data-model-select-menu]")) return;
      if (!customButton.current?.contains(target) && !popover.current?.contains(target)) onCustomOpenChange(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [customOpen, onCustomOpenChange]);

  const [draftSession, setDraftSession] = useState(customOpen);
  if (customOpen !== draftSession) {
    setDraftSession(customOpen);
    if (customOpen) {
      const start = parseTimeInput(customStart) ?? Date.now() - 60 * 60_000;
      const end = parseTimeInput(customEnd) ?? Date.now();
      const startDate = new Date(start);
      setDraftStart(start);
      setDraftEnd(end);
      setMonth(new Date(startDate.getFullYear(), startDate.getMonth(), 1));
      setActiveField("start");
      setLiveEnd(appliedLiveEnd);
      setProviders(selectedProviders);
      setModels(selectedModels);
    }
  }

  useEffect(() => {
    if (!customOpen || !liveEnd) return;
    const timer = window.setInterval(() => setDraftEnd(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [customOpen, liveEnd]);

  const days = useMemo(() => calendarDays(month), [month]);
  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(new Date(2024, 0, 7 + index))), [locale]);
  const providerOptions = useMemo(() => [...new Set(modelOptions.map((option) => option.group))].map((group) => ({
    value: group,
    label: group,
    group: t("供应商"),
  })), [modelOptions]);
  const visibleModels = providers.length === 0 ? modelOptions : modelOptions.filter((option) => providers.includes(option.group));
  const startDate = new Date(draftStart);
  const endDate = new Date(draftEnd);
  const today = new Date();

  const apply = (startMs: number, endMs: number, followNow: boolean) => {
    if (startMs >= endMs) return;
    onCustomApply({
      startMs,
      endMs,
      liveEnd: followNow,
      providers,
      models,
      modelHashes: filteredHashes(modelOptions, providers, models),
    });
  };

  const pickDay = (day: Date) => {
    const next = keepTime(activeField === "start" || liveEnd ? draftStart : draftEnd, day);
    if (liveEnd) {
      setDraftStart(next);
    } else if (activeField === "start") {
      setDraftStart(next);
      if (next > draftEnd) setDraftEnd(next);
      setActiveField("end");
    } else if (next < draftStart) {
      setDraftStart(next);
      setActiveField("end");
    } else {
      setDraftEnd(next);
    }
    if (day.getMonth() !== month.getMonth() || day.getFullYear() !== month.getFullYear()) {
      setMonth(new Date(day.getFullYear(), day.getMonth(), 1));
    }
  };

  return <div className={styles.root} aria-label={t("概览时间范围")}>
    <div className={styles.presets}>
      {presets.map((preset) => <button
        key={preset.value}
        type="button"
        aria-pressed={value === preset.value}
        onClick={() => onSelect(preset.value)}
      >{preset.label}</button>)}
      <button
        ref={customButton}
        type="button"
        aria-haspopup="dialog"
        aria-controls={customOpen ? popoverId : undefined}
        aria-expanded={customOpen}
        aria-pressed={value === "custom"}
        onClick={() => onCustomOpenChange(!customOpen)}
      >{t("自定义")}</button>
    </div>
    <TooltipTrigger label={t("刷新")}><button className={controls.iconButton} aria-label={t("刷新")} disabled={busy} onClick={onRefresh}>
      <Icon className={busy ? controls.spin : ""} icon={refreshIcon} size="1.1em" />
    </button></TooltipTrigger>
    {customOpen && createPortal(<div
      id={popoverId}
      ref={popover}
      className={styles.popover}
      role="dialog"
      aria-label={t("自定义概览筛选")}
      style={position}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCustomOpenChange(false);
          customButton.current?.focus();
        }
      }}
    >
      <div className={styles.quickPresets}>
        {popoverPresets.map((preset) => <button key={preset.label} type="button" onClick={() => {
          const range = preset.range();
          apply(range.startMs, range.endMs, false);
        }}>{preset.label}</button>)}
      </div>
      <div className={styles.layout}>
        <div className={styles.fields}>
          <p>{t("支持日期与时间")}</p>
          {(["start", "end"] as const).map((field) => {
            const locked = field === "end" && liveEnd;
            const stamp = field === "start" ? draftStart : draftEnd;
            return <div key={field} className={styles.field} data-active={!locked && activeField === field ? true : undefined} data-locked={locked || undefined} onClick={() => { if (!locked) setActiveField(field); }}>
              <span>{field === "start" ? t("开始时间") : t("结束时间")}</span>
              <div>
                <input
                  type="date"
                  aria-label={field === "start" ? t("开始时间") : t("结束时间")}
                  value={dateValue(stamp)}
                  disabled={locked}
                  onFocus={() => { if (!locked) setActiveField(field); }}
                  onChange={(event) => {
                    const next = withDate(stamp, event.target.value);
                    if (field === "start") setDraftStart(next);
                    else setDraftEnd(next);
                    const date = new Date(next);
                    setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
                  }}
                />
                <input
                  type="time"
                  aria-label={field === "start" ? t("开始时间") : t("结束时间")}
                  value={timeValue(stamp)}
                  disabled={locked}
                  onFocus={() => { if (!locked) setActiveField(field); }}
                  onChange={(event) => {
                    const next = withTime(stamp, event.target.value);
                    if (field === "start") setDraftStart(next);
                    else setDraftEnd(next);
                  }}
                />
              </div>
            </div>;
          })}
          <Checkbox
            checked={liveEnd}
            label={t("结束时间跟随当前时刻")}
            onChange={(checked) => {
              setLiveEnd(checked);
              if (checked) {
                setDraftEnd(Date.now());
                setActiveField("start");
              }
            }}
          />
          <div className={styles.filters}>
            <ModelSelect
              mode="multiple"
              label={t("供应商")}
              value={providers}
              options={providerOptions}
              onChange={(next) => {
                setProviders(next);
                setModels((current) => current.filter((id) => {
                  const option = modelOptions.find((item) => item.value === id);
                  return next.length === 0 || Boolean(option && next.includes(option.group));
                }));
              }}
            />
            <ModelSelect mode="multiple" label={t("模型")} value={models} options={visibleModels} onChange={setModels} />
          </div>
          <div className={styles.popoverActions}>
            <button type="button" className={controls.secondary} onClick={() => onCustomOpenChange(false)}>{t("取消")}</button>
            <button type="button" className={controls.primary} disabled={draftStart >= draftEnd} onClick={() => apply(draftStart, liveEnd ? Date.now() : draftEnd, liveEnd)}>{t("确定")}</button>
          </div>
        </div>
        <div className={styles.calendar}>
          <div className={styles.month}>
            <button type="button" aria-label={t("上个月")} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><Icon icon={chevronLeftIcon} size="1.1em" /></button>
            <button type="button" onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))}>
              {month.toLocaleDateString(locale, { year: "numeric", month: "long" })}
            </button>
            <button type="button" aria-label={t("下个月")} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><Icon icon={chevronRightIcon} size="1.1em" /></button>
          </div>
          <div className={styles.weekdays}>{weekdays.map((label, index) => <span key={index}>{label}</span>)}</div>
          <div className={styles.days}>
            {days.map((day) => {
              const inMonth = day.getMonth() === month.getMonth();
              const edge = sameDay(day, startDate) || sameDay(day, endDate);
              const inRange = startOfDay(day) >= startOfDay(startDate) && startOfDay(day) <= startOfDay(endDate);
              return <button
                key={day.toISOString()}
                type="button"
                aria-label={day.toLocaleDateString(locale)}
                aria-current={sameDay(day, today) ? "date" : undefined}
                aria-pressed={edge}
                data-out={!inMonth || undefined}
                data-in={inRange && !edge ? true : undefined}
                data-edge={edge || undefined}
                data-today={sameDay(day, today) && !edge ? true : undefined}
                onClick={() => pickDay(day)}
              >{day.getDate()}</button>;
            })}
          </div>
        </div>
      </div>
    </div>, document.body)}
  </div>;
}
