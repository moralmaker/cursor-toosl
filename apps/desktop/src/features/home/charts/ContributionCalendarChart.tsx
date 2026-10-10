import { Fragment, useMemo, useState } from "react";
import { useI18n } from "../../../i18n/store";
import { formatCompactInteger, formatInteger } from "../../../shared/utils/numberFormat";
import { useTooltip, type TooltipAnchor } from "../../../shared/ui/Tooltip";
import { formatUSD } from "../metrics/tokenPrice";
import styles from "./ContributionCalendarChart.module.scss";

export const HEATMAP_WEEKS = 53;

export type HeatMetric = "tokens" | "requests" | "cost";

export type ContributionDay = {
  date: string;
  tokens: number;
  requests: number;
  cost: number;
  unpricedTokens: number;
  inRange: boolean;
  future: boolean;
};

const LEVELS = [0, 1, 2, 3, 4];

function parseDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

function metricValue(day: ContributionDay, metric: HeatMetric) {
  if (metric === "requests") return day.requests;
  if (metric === "cost") return day.cost;
  return day.tokens;
}

function buildThresholds(values: number[]) {
  const sorted = values.filter((value) => value > 0).sort((left, right) => left - right);
  if (sorted.length === 0) return [Infinity, Infinity, Infinity];
  const at = (quantile: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * quantile))];
  return [at(0.25), at(0.5), at(0.75)];
}

function levelOf(value: number, thresholds: number[]) {
  if (value <= 0) return 0;
  if (value <= thresholds[0]) return 1;
  if (value <= thresholds[1]) return 2;
  if (value <= thresholds[2]) return 3;
  return 4;
}

function costLabel(cost: number, tokens: number, unpricedTokens: number) {
  if (tokens > 0 && unpricedTokens >= tokens && cost === 0) return t("未定价");
  const priced = formatUSD(cost);
  return unpricedTokens > 0 ? t("{cost}，未定价 {tokens}", { cost: priced, tokens: formatCompactInteger(unpricedTokens) }) : priced;
}

function elementAnchor(element: HTMLElement): TooltipAnchor {
  return {
    contextElement: element,
    getBoundingClientRect: () => element.getBoundingClientRect(),
  };
}

export function heatmapWindow(now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(today);
  start.setDate(today.getDate() - ((today.getDay() + 6) % 7) - (HEATMAP_WEEKS - 1) * 7);
  const end = new Date(today);
  end.setDate(today.getDate() + 1);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

export function ContributionCalendarChart({ days, startMs, endMs }: {
  days: ContributionDay[];
  startMs: number;
  endMs: number;
}) {
  const { locale } = useI18n();
  const { show, hide } = useTooltip();
  const [metric, setMetric] = useState<HeatMetric>("tokens");
  const weekdayLabels = useMemo(() => Array.from({ length: 7 }, (_, index) => new Date(2024, 0, 1 + index).toLocaleDateString(locale, { weekday: "short" })), [locale]);
  const monthFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { month: "short" }), [locale]);
  const dayFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric", weekday: "short" }), [locale]);
  const rangeFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" }), [locale]);
  const weeks = useMemo(() => Array.from({ length: HEATMAP_WEEKS }, (_, week) => days.slice(week * 7, week * 7 + 7)), [days]);
  const thresholds = useMemo(() => buildThresholds(days.filter((day) => day.inRange).map((day) => metricValue(day, metric))), [days, metric]);
  const totals = days.reduce((sum, day) => day.inRange ? {
    tokens: sum.tokens + day.tokens,
    requests: sum.requests + day.requests,
    cost: sum.cost + day.cost,
    unpricedTokens: sum.unpricedTokens + day.unpricedTokens,
  } : sum, { tokens: 0, requests: 0, cost: 0, unpricedTokens: 0 });
  const monthLabels = weeks.map((week, index) => {
    if (week.length === 0) return "";
    if (index === 0) return monthFormatter.format(parseDate(week[0].date));
    const first = week.find((day) => parseDate(day.date).getDate() === 1);
    return first ? monthFormatter.format(parseDate(first.date)) : "";
  });
  const metrics: Array<{ value: HeatMetric; label: string }> = [
    { value: "tokens", label: t("用量") },
    { value: "requests", label: t("请求") },
    { value: "cost", label: t("成本") },
  ];

  return <section className={styles.root} aria-label={t("用量热力图")}>
    <header>
      <div>
        <strong>{t("用量热力图")}</strong>
        <p>{t("最近 53 周的每日用量")}</p>
      </div>
      <div className={styles.segment} role="group" aria-label={t("热力图指标")}>
        {metrics.map((item) => <button key={item.value} type="button" aria-pressed={metric === item.value} onClick={() => setMetric(item.value)}>{item.label}</button>)}
      </div>
    </header>
    <div className={styles.summary}>
      <strong>{`${rangeFormatter.format(new Date(startMs))} – ${rangeFormatter.format(new Date(Math.max(startMs, endMs - 1)))}`}</strong>
      <span>{t("{tokens} Token · {requests} 次请求 · {cost}", {
        tokens: formatCompactInteger(totals.tokens),
        requests: formatCompactInteger(totals.requests),
        cost: costLabel(totals.cost, totals.tokens, totals.unpricedTokens),
      })}</span>
    </div>
    <div className={styles.grid} style={{ gridTemplateColumns: `max-content repeat(${HEATMAP_WEEKS}, minmax(0, 1fr))` }}>
      <span />
      {monthLabels.map((label, index) => <span key={index} className={styles.month}>{label}</span>)}
      {weekdayLabels.map((label, row) => <Fragment key={row}>
        <span className={styles.weekday}>{row % 2 === 0 ? label : ""}</span>
        {weeks.map((week) => {
          const day = week[row];
          if (!day) return <span key={`${row}-empty`} />;
          const level = day.inRange ? levelOf(metricValue(day, metric), thresholds) : undefined;
          return <div
            key={day.date}
            className={styles.cell}
            data-level={level}
            data-out={!day.future && !day.inRange ? true : undefined}
            data-future={day.future ? true : undefined}
            onMouseEnter={day.future ? undefined : (event) => show(elementAnchor(event.currentTarget), day.date, <div className={styles.tooltip}>
              <strong>{dayFormatter.format(parseDate(day.date))}</strong>
              {day.inRange ? <>
                <span>{t("Token 用量：{tokens}", { tokens: formatInteger(day.tokens) })}</span>
                <span>{t("{count} 次请求", { count: formatInteger(day.requests) })}</span>
                <span>{costLabel(day.cost, day.tokens, day.unpricedTokens)}</span>
              </> : <span>{t("不在当前时间范围内")}</span>}
            </div>)}
            onMouseLeave={day.future ? undefined : hide}
          />;
        })}
      </Fragment>)}
    </div>
    <div className={styles.scale}>
      <span>{t("少")}</span>
      {LEVELS.map((level) => <i key={level} data-level={level} />)}
      <span>{t("多")}</span>
    </div>
  </section>;
}
