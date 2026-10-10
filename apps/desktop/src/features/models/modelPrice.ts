import type { ModelTokenPrice, OfficialModelPrice } from "../../shared/api";

export function formatUnitPrice(value: number) {
  const fixed = value.toFixed(4).replace(/0+$/, "");
  const [whole, fraction = ""] = fixed.split(".");
  return `$${whole}.${fraction.padEnd(2, "0")}`;
}

export function officialPrice(modelId: string, catalog: OfficialModelPrice[]) {
  const candidates = pricingCandidates(modelId);
  for (const candidate of candidates) {
    const exact = catalog.find((entry) => entry.model_id === candidate);
    if (exact) return exact.price;
  }
  for (const candidate of candidates) {
    if (!prefixMatchAllowed(candidate)) continue;
    const matched = catalog
      .filter((entry) => entry.model_id.startsWith(`${candidate}-`))
      .sort((left, right) => left.model_id.length - right.model_id.length)[0];
    if (matched) return matched.price;
  }
  return null;
}

export function emptyCustomPrice(official: ModelTokenPrice | null): ModelTokenPrice {
  return official ?? {
    input_cost_per_million: 0,
    output_cost_per_million: 0,
    cache_read_cost_per_million: 0,
    cache_write_cost_per_million: 0,
  };
}

function pricingCandidates(modelId: string) {
  const cleaned = cleanModelId(modelId);
  if (!cleaned || cleaned === "unknown" || cleaned === "null" || cleaned === "none") return [];
  const candidates: string[] = [];
  const queue = [cleaned];
  while (queue.length > 0) {
    const candidate = queue.pop() ?? "";
    if (!candidate || candidates.includes(candidate)) continue;
    const dated = stripDateSuffix(candidate);
    if (dated) queue.push(dated);
    const effort = stripEffortSuffix(candidate);
    if (effort) queue.push(effort);
    if (candidate.startsWith("claude-") && candidate.includes(".")) queue.push(candidate.replaceAll(".", "-"));
    candidates.push(candidate);
  }
  return candidates;
}

function cleanModelId(modelId: string) {
  const tail = modelId.split("/").at(-1) ?? modelId;
  return (tail.split(":")[0] ?? tail).trim().replaceAll("@", "-").toLowerCase();
}

function stripDateSuffix(modelId: string) {
  if (modelId.length > 11 && /^-\d{4}-\d{2}-\d{2}$/.test(modelId.slice(-11))) return modelId.slice(0, -11);
  const split = modelId.lastIndexOf("-");
  if (split <= 0) return null;
  const base = modelId.slice(0, split);
  const suffix = modelId.slice(split + 1);
  if (!/^\d+$/.test(suffix)) return null;
  if (suffix.length === 8) return base;
  if (suffix.length === 6) {
    const month = Number(suffix.slice(2, 4));
    const day = Number(suffix.slice(4, 6));
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return base;
  }
  return null;
}

function stripEffortSuffix(modelId: string) {
  for (const suffix of ["-minimal", "-low", "-medium", "-high", "-xhigh"]) {
    if (modelId.endsWith(suffix) && modelId.length > suffix.length) return modelId.slice(0, -suffix.length);
  }
  return null;
}

function prefixMatchAllowed(modelId: string) {
  const dashes = modelId.split("-").length - 1;
  if (modelId.startsWith("claude-")) return dashes >= 3;
  const families = ["gpt-", "gemini-", "deepseek-", "qwen", "glm-", "kimi-", "minimax-", "grok-"];
  return families.some((prefix) => modelId.startsWith(prefix)) && dashes >= 2;
}
