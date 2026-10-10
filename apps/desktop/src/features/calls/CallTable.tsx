import type { LlmCall } from "../../shared/api";
import controls from "../../shared/ui/Controls.module.scss";
import { DataTable, type DataTableColumn } from "../../shared/ui/DataTable";
import { Icon } from "../../shared/ui/Icon";
import { TooltipTrigger } from "../../shared/ui/TooltipTrigger";
import { eyeIcon } from "../../shared/ui/icons";
import styles from "./CallTable.module.scss";

const value = (input: string | number | null) => input ?? "-";
const milliseconds = (input: number | null) => input == null ? "-" : `${input} ms`;

export const callColumnOrder = [
  "status",
  "display_name",
  "created_at",
  "model_id",
  "reasoning_effort",
  "fast",
  "call_kind",
  "route",
  "finish_reason",
  "http",
  "duration",
  "ttfb",
  "ttfr",
  "ttft",
  "input_tokens",
  "output_tokens",
  "total_tokens",
  "cache_read",
  "cache_write",
  "reasoning_tokens",
  "message_count",
  "tool_count",
  "detailed",
  "error_kind",
  "error_message",
  "call_id",
  "run_id",
  "conversation_id",
  "call_index",
] as const;

export type CallColumnKey = typeof callColumnOrder[number];

export const defaultVisibleCallColumns: CallColumnKey[] = [
  "status",
  "display_name",
  "created_at",
  "model_id",
  "http",
  "duration",
  "ttft",
  "total_tokens",
];

export function callColumnLabels(): Record<CallColumnKey, string> {
  return {
    status: t("状态"),
    display_name: t("显示名称"),
    created_at: t("时间"),
    model_id: t("模型名称"),
    reasoning_effort: t("思考强度"),
    fast: "Fast",
    call_kind: t("调用类型"),
    route: t("路由"),
    finish_reason: "Finish Reason",
    http: "HTTP",
    duration: t("耗时"),
    ttfb: "TTFB",
    ttfr: "TTFR",
    ttft: "TTFT",
    input_tokens: "Input Token",
    output_tokens: "Output Token",
    total_tokens: "Total Token",
    cache_read: "Cache Read",
    cache_write: "Cache Write",
    reasoning_tokens: "Reasoning Token",
    message_count: t("消息数"),
    tool_count: t("工具数"),
    detailed: t("详细记录"),
    error_kind: "Error Kind",
    error_message: "Error Message",
    call_id: "Call ID",
    run_id: "Run ID",
    conversation_id: "Conversation ID",
    call_index: "Call Index",
  };
}

export function CallStatus({ status }: { status: string }) {
  return <span className={[styles.status, statusClass(status)].filter(Boolean).join(" ")}>{statusLabel(status)}</span>;
}

function statusLabel(status: string) {
  if (status === "running") return t("进行中");
  if (status === "completed") return t("成功");
  if (status === "error" || status === "failed") return t("异常");
  if (status === "cancelled") return t("已取消");
  return status;
}

function rowTone(call: LlmCall) {
  return call.status === "error" || call.status === "failed" ? "fail" : undefined;
}

const statusClass = (status: string) => ({
  running: styles.running,
  completed: styles.completed,
  error: styles.error,
  failed: styles.failed,
  cancelled: styles.cancelled,
}[status]);

export function CallTable({ calls, visible, onDetails }: {
  calls: LlmCall[];
  visible: ReadonlySet<CallColumnKey>;
  onDetails: (call: LlmCall) => void;
}) {
  const labels = callColumnLabels();
  const columns: DataTableColumn<LlmCall>[] = [
    {
      key: "status",
      header: labels.status,
      render: (call) => <CallStatus status={call.status} />,
    },
    { key: "display_name", header: labels.display_name, render: (call) => call.display_name, title: (call) => call.display_name },
    { key: "created_at", header: labels.created_at, render: (call) => new Date(call.created_at_ms).toLocaleString() },
    { key: "model_id", header: labels.model_id, render: (call) => call.model_id, title: (call) => call.model_id },
    { key: "reasoning_effort", header: labels.reasoning_effort, render: (call) => value(call.reasoning_effort) },
    { key: "fast", header: labels.fast, render: (call) => call.fast == null ? "-" : call.fast ? t("是") : t("否") },
    { key: "call_kind", header: labels.call_kind, render: (call) => call.call_kind === "cursor_official" ? t("Cursor 官方") : "LLM" },
    { key: "route", header: labels.route, render: (call) => call.route === "cursor_official" ? t("Cursor 官方") : "TOOLS" },
    { key: "finish_reason", header: labels.finish_reason, render: (call) => value(call.finish_reason) },
    { key: "http", header: labels.http, render: (call) => value(call.http_status) },
    { key: "duration", header: labels.duration, render: (call) => milliseconds(call.duration_ms) },
    { key: "ttfb", header: labels.ttfb, render: (call) => milliseconds(call.ttfb_ms) },
    { key: "ttfr", header: labels.ttfr, render: (call) => milliseconds(call.ttfr_ms) },
    { key: "ttft", header: labels.ttft, render: (call) => milliseconds(call.ttft_ms) },
    { key: "input_tokens", header: labels.input_tokens, render: (call) => value(call.input_tokens) },
    { key: "output_tokens", header: labels.output_tokens, render: (call) => value(call.output_tokens) },
    { key: "total_tokens", header: labels.total_tokens, render: (call) => value(call.total_tokens) },
    { key: "cache_read", header: labels.cache_read, render: (call) => value(call.cache_read_tokens) },
    { key: "cache_write", header: labels.cache_write, render: (call) => value(call.cache_write_tokens) },
    { key: "reasoning_tokens", header: labels.reasoning_tokens, render: (call) => value(call.reasoning_tokens) },
    { key: "message_count", header: labels.message_count, render: (call) => call.message_count },
    { key: "tool_count", header: labels.tool_count, render: (call) => call.tool_count },
    { key: "detailed", header: labels.detailed, render: (call) => call.detailed ? t("是") : t("否") },
    { key: "error_kind", header: labels.error_kind, render: (call) => value(call.error_kind), title: (call) => call.error_kind ?? undefined },
    { key: "error_message", header: labels.error_message, render: (call) => value(call.error_message), title: (call) => call.error_message ?? undefined },
    { key: "call_id", header: labels.call_id, render: (call) => call.call_id, title: (call) => call.call_id },
    { key: "run_id", header: labels.run_id, render: (call) => call.run_id, title: (call) => call.run_id },
    { key: "conversation_id", header: labels.conversation_id, render: (call) => call.conversation_id, title: (call) => call.conversation_id },
    { key: "call_index", header: labels.call_index, render: (call) => call.provider_call_index },
    {
      key: "actions",
      header: t("操作"),
      sticky: "right",
      render: (call) => (
        <TooltipTrigger label={t("查看详情")}>
          <button className={controls.iconButton} aria-label={t("查看详情")} onClick={() => onDetails(call)}>
            <Icon icon={eyeIcon} size="1.1em" />
          </button>
        </TooltipTrigger>
      ),
    },
  ];
  const shown = columns.filter((column) => column.key === "actions" || visible.has(column.key as CallColumnKey));
  return <DataTable
    rows={calls}
    columns={shown}
    rowKey={(call) => call.call_id}
    minWidth={Math.max(720, (shown.length - 1) * 140 + 72)}
    rowTone={rowTone}
    onRowClick={onDetails}
  />;
}
