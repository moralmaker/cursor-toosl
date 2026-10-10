import { useEffect, useState } from "react";
import { api, pluginText, type Overview } from "../../shared/api";
import { ContributionCalendarChart, HEATMAP_WEEKS, heatmapWindow, type ContributionDay } from "./charts/ContributionCalendarChart";
import { DailyTokenUsageChart } from "./charts/DailyTokenUsageChart";
import { HomeMetrics } from "./metrics/HomeMetrics";
import { PageContent } from "../../shell/layout/PageContent";
import type { VirtualPageSection } from "../../shell/layout/VirtualPage";
import { OverviewTimeRangeFilter, type OverviewCustomApply, type OverviewRangePreset } from "./overview/OverviewTimeRangeFilter";
import { QuickStart, useQuickStart } from "./overview/QuickStart";
import { PageActions } from "../../shell/PageActions";
import { appStore, useAppStore } from "../../shared/store/appStore";
import { formatTimeInput } from "../../shared/utils/parseTimeInput";
import { modelProviderName } from "../../shared/utils/modelProvider";
import { claudeIcon, flatColorOrganizationIcon, openAiIcon } from "../../shared/ui/icons";
import { useI18n } from "../../i18n/store";

type TimeRange = { startMs: number; endMs: number };

function localDateKey(ms: number) {
  const date = new Date(ms);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function heatmapDays(overview: Overview | null, range: TimeRange): ContributionDay[] {
  const totals = new Map<string, { tokens: number; requests: number; cost: number; unpriced: number }>();
  for (const bucket of overview?.token_usage_series ?? []) {
    const date = localDateKey(bucket.bucket_start_ms);
    const current = totals.get(date) ?? { tokens: 0, requests: 0, cost: 0, unpriced: 0 };
    current.tokens += bucket.input_tokens + bucket.cache_read_tokens + bucket.cache_write_tokens + bucket.output_tokens;
    current.requests += bucket.llm_calls ?? 0;
    current.cost += bucket.estimated_cost_usd ?? 0;
    current.unpriced += bucket.unpriced_tokens ?? 0;
    totals.set(date, current);
  }
  const span = heatmapWindow();
  const today = localDateKey(Date.now());
  const rangeStart = localDateKey(range.startMs);
  const rangeEnd = localDateKey(Math.max(range.startMs, range.endMs - 1));
  const cursor = new Date(span.startMs);
  return Array.from({ length: HEATMAP_WEEKS * 7 }, () => {
    const date = localDateKey(cursor.getTime());
    const stat = totals.get(date);
    const future = date > today;
    const inRange = !future && date >= rangeStart && date <= rangeEnd;
    const day: ContributionDay = {
      date,
      tokens: inRange ? stat?.tokens ?? 0 : 0,
      requests: inRange ? stat?.requests ?? 0 : 0,
      cost: inRange ? stat?.cost ?? 0 : 0,
      unpricedTokens: inRange ? stat?.unpriced ?? 0 : 0,
      inRange,
      future,
    };
    cursor.setDate(cursor.getDate() + 1);
    return day;
  });
}

function presetRange(preset: Exclude<OverviewRangePreset, "custom">, now = new Date()): TimeRange {
  const endMs = now.getTime();
  if (preset === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { startMs: start.getTime(), endMs };
  }
  if (preset === "month") {
    const start = new Date(now);
    start.setMonth(start.getMonth() - 1);
    return { startMs: start.getTime(), endMs };
  }
  const duration = preset === "ten-minutes" ? 10 * 60_000
    : preset === "hour" ? 60 * 60_000
    : 7 * 24 * 60 * 60_000;
  return { startMs: now.getTime() - duration, endMs };
}

export function HomePage() {
  const { overview, busy, models, plugins } = useAppStore();
  const quickStart = useQuickStart();
  const { locale } = useI18n();
  const [preset, setPreset] = useState<OverviewRangePreset>("month");
  const [customRange, setCustomRange] = useState<TimeRange | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [liveEnd, setLiveEnd] = useState(false);
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [appliedModels, setAppliedModels] = useState<string[]>([]);
  const [rangeOverview, setRangeOverview] = useState<Overview | null>(null);
  const [heatmapOverview, setHeatmapOverview] = useState<Overview | null>(null);
  const [rangeBusy, setRangeBusy] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const selectedRange = preset === "custom" ? customRange : presetRange(preset);

  useEffect(() => {
    if (!selectedRange) return;
    let active = true;
    setRangeBusy(true);
    void api.overview({
      ...selectedRange,
      modelHashes: appliedModels,
    }).then((next) => {
      if (active) setRangeOverview(next);
    }).finally(() => {
      if (active) setRangeBusy(false);
    });
    return () => { active = false; };
  }, [preset, customRange, overview, refreshVersion, appliedModels]);

  useEffect(() => {
    const span = heatmapWindow();
    let active = true;
    void api.overview({
      startMs: span.startMs,
      endMs: span.endMs,
      modelHashes: appliedModels,
      bucketMs: 24 * 60 * 60_000,
    }).then((next) => {
      if (active) setHeatmapOverview(next);
    });
    return () => { active = false; };
  }, [appliedModels, overview, refreshVersion]);

  useEffect(() => {
    if (!liveEnd || preset !== "custom") return;
    const timer = window.setInterval(() => {
      setCustomRange((current) => current ? { ...current, endMs: Date.now() } : current);
      setCustomEnd(formatTimeInput(new Date()));
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [liveEnd, preset]);

  const filteredOverview = rangeOverview ?? overview;
  const dailyTokenUsage = filteredOverview.token_usage_series.map((bucket) => ({
    bucketStartMs: bucket.bucket_start_ms,
    inputTokens: bucket.input_tokens,
    cacheReadTokens: bucket.cache_read_tokens,
    cacheWriteTokens: bucket.cache_write_tokens,
    outputTokens: bucket.output_tokens,
  }));
  const contributionRange = selectedRange ?? { startMs: 0, endMs: Date.now() };
  const contribution = heatmapDays(heatmapOverview, contributionRange);
  const metrics = {
    llmCalls: filteredOverview.metrics.llm_calls,
    successfulCalls: filteredOverview.metrics.successful_calls,
    failedCalls: filteredOverview.metrics.failed_calls,
    tokenUsage: filteredOverview.metrics.token_usage,
    promptTokens: filteredOverview.metrics.prompt_tokens,
    cacheReadTokens: filteredOverview.metrics.cache_read_tokens,
    cacheWriteTokens: filteredOverview.metrics.cache_write_tokens,
    estimatedCost: filteredOverview.metrics.estimated_cost_usd ?? 0,
    unpricedTokens: filteredOverview.metrics.unpriced_tokens ?? 0,
  };
  const openCustom = (open: boolean) => {
    if (open && !customStart && !customEnd) {
      const now = new Date();
      setCustomEnd(formatTimeInput(now));
      setCustomStart(formatTimeInput(new Date(now.getTime() - 60 * 60_000)));
    }
    setCustomOpen(open);
  };
  const applyCustom = ({ startMs, endMs, liveEnd: followNow, providers, models: nextModels, modelHashes }: OverviewCustomApply) => {
    setCustomStart(formatTimeInput(new Date(startMs)));
    setCustomEnd(formatTimeInput(new Date(endMs)));
    setCustomRange({ startMs, endMs });
    setSelectedProviders(providers);
    setSelectedModels(nextModels);
    setAppliedModels(modelHashes);
    setLiveEnd(followNow);
    setPreset("custom");
    setCustomOpen(false);
  };
  const selectPreset = (value: Exclude<OverviewRangePreset, "custom">) => {
    setPreset(value);
    setLiveEnd(false);
    setSelectedProviders([]);
    setSelectedModels([]);
    setAppliedModels([]);
    setCustomOpen(false);
  };
  const refresh = async () => {
    await appStore.refresh();
    setRefreshVersion((version) => version + 1);
  };
  const iconFor = (type: string) => type === "anthropic" ? claudeIcon : openAiIcon;
  const modelOptions = [
    ...models.map((model) => ({
      value: model.model_hash,
      label: model.display_name,
      group: modelProviderName(model),
      icon: iconFor(model.type),
    })),
    ...plugins.flatMap((plugin) => plugin.providers.flatMap((provider) =>
      provider.configured ? provider.models.filter((model) => model.enabled).map((model) => ({
        value: model.id,
        label: model.displayName,
        group: pluginText(provider.displayName, locale) || model.pluginName,
        iconSrc: model.icon || undefined,
        icon: model.icon ? undefined : flatColorOrganizationIcon,
      })) : [],
    )),
  ];
  const sections: VirtualPageSection[] = [
    ...(quickStart.visible ? [{
      key: "quick-start",
      estimatedHeight: 72,
      content: <QuickStart done={quickStart.done} pending={quickStart.pending} busy={quickStart.busy} onRun={(id) => void quickStart.run(id)} />,
    }] : []),
    {
      key: "daily-token-usage",
      estimatedHeight: 268,
      content: <DailyTokenUsageChart
        data={dailyTokenUsage}
        granularity={filteredOverview.token_usage_granularity}
      />,
    },
    {
      key: "metrics",
      estimatedHeight: 130,
      content: <HomeMetrics data={metrics} refreshVersion={refreshVersion} />,
    },

    {
      key: "activity",
      estimatedHeight: 220,
      content: <ContributionCalendarChart days={contribution} startMs={contributionRange.startMs} endMs={contributionRange.endMs} />,
    },
  ];

  return <>
    <PageActions><OverviewTimeRangeFilter
      value={preset}
      customOpen={customOpen}
      customStart={customStart}
      customEnd={customEnd}
      liveEnd={liveEnd}
      modelOptions={modelOptions}
      selectedProviders={selectedProviders}
      selectedModels={selectedModels}
      busy={busy || rangeBusy}
      onSelect={selectPreset}
      onCustomOpenChange={openCustom}
      onCustomApply={applyCustom}
      onRefresh={() => void refresh()}
    /></PageActions>
    <PageContent title={t("概览")} sections={sections} />
  </>;
}
