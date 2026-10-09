import { z } from "zod";
import { isAbsoluteHttpUrl } from "./http.ts";
import { compareSemver } from "./semver.ts";

export const SLOT_LOCALES = ["all", "zh-CN", "en-US"] as const;
export type SlotLocale = (typeof SLOT_LOCALES)[number];

const httpUrl = z
  .string()
  .min(1)
  .max(2000)
  .refine(isAbsoluteHttpUrl, "must be an absolute http(s) URL with a host");

const detailSchema = z.object({
  label: z.string().trim().min(1).max(100),
  value: z.string().trim().min(1).max(2000),
});

const targetSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(500),
  imageUrl: httpUrl,
});

const contentSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(2000),
  imageUrl: httpUrl,
  details: z.array(detailSchema).max(20),
  button: z
    .object({
      label: z.string().trim().min(1).max(50),
      action: z.object({
        type: z.literal("open_browser"),
        url: httpUrl,
      }),
    })
    .optional(),
});

// 1.0.0 及更早的桌面端把 content.button 当必填，缺按钮会让整份广告解析失败。
const LAST_VERSION_REQUIRING_BUTTON = "1.0.0";

const instantSchema = z
  .string()
  .trim()
  .max(40)
  .refine((value) => value === "" || !Number.isNaN(Date.parse(value)), "invalid timestamp")
  .transform((value) => (value === "" ? null : new Date(value).toISOString()))
  .nullable()
  .optional();

export const slotInputSchema = z.object({
  enabled: z.boolean().default(true),
  dismissible: z.boolean().default(true),
  placement: z.literal("menu").default("menu"),
  locale: z.enum(SLOT_LOCALES).default("all"),
  sortOrder: z.number().int().min(0).max(100000).default(0),
  startsAt: instantSchema,
  endsAt: instantSchema,
  target: targetSchema,
  content: contentSchema,
});

export type SlotInput = z.infer<typeof slotInputSchema>;

export type StoredSlot = SlotInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export type PublicSlot = {
  id: string;
  enabled: true;
  dismissible: boolean;
  placement: "menu";
  target: SlotInput["target"];
  content: SlotInput["content"];
};

export function parseSlotInput(input: unknown): { value: SlotInput } | { errors: string[] } {
  const result = slotInputSchema.safeParse(input);
  if (!result.success) {
    return { errors: result.error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`) };
  }
  const value = result.data;
  if (value.startsAt && value.endsAt && value.startsAt > value.endsAt) {
    return { errors: ["startsAt must be before endsAt"] };
  }
  return { value };
}

export function toPublicSlot(slot: StoredSlot): PublicSlot {
  return {
    id: slot.id,
    enabled: true,
    dismissible: slot.dismissible,
    placement: "menu",
    target: slot.target,
    content: slot.content,
  };
}

export function clientLocale(acceptLanguage: string): "zh-CN" | "en-US" {
  return /zh-cn/i.test(acceptLanguage) ? "zh-CN" : "en-US";
}

export function slotVisibleNow(slot: StoredSlot, nowIso: string): boolean {
  if (!slot.enabled || slot.placement !== "menu") {
    return false;
  }
  if (slot.startsAt && slot.startsAt > nowIso) {
    return false;
  }
  if (slot.endsAt && slot.endsAt < nowIso) {
    return false;
  }
  return true;
}

export function slotDismissedByClient(slot: StoredSlot, dismissedIds: ReadonlySet<string>): boolean {
  return slot.dismissible && dismissedIds.has(slot.id);
}

export function slotSupportedByClient(slot: StoredSlot, appVersion: string): boolean {
  return Boolean(slot.content.button) || compareSemver(appVersion, LAST_VERSION_REQUIRING_BUTTON) > 0;
}

export function slotMatchesLocale(slot: StoredSlot, locale: "zh-CN" | "en-US"): boolean {
  return slot.locale === "all" || slot.locale === locale;
}

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
