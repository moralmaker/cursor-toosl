import { describe, expect, it } from "vitest";
import {
  clientLocale,
  parseSlotInput,
  slotDismissedByClient,
  slotMatchesLocale,
  slotSupportedByClient,
  slotVisibleNow,
  toPublicSlot,
} from "./slot.ts";

const validSlot = {
  enabled: true,
  placement: "menu" as const,
  locale: "all" as const,
  sortOrder: 1,
  target: {
    title: "菜单标题",
    description: "菜单描述",
    imageUrl: "https://cdn.example.com/icon.png",
  },
  content: {
    title: "弹层标题",
    description: "弹层描述",
    imageUrl: "https://cdn.example.com/banner.png",
    details: [{ label: "价格", value: "免费" }],
    button: {
      label: "打开",
      action: { type: "open_browser" as const, url: "https://example.com/landing" },
    },
  },
};

describe("parseSlotInput", () => {
  it("accepts a client-compatible slot", () => {
    const parsed = parseSlotInput(validSlot);
    expect(parsed).toMatchObject({ value: expect.objectContaining({ placement: "menu" }) });
  });

  it("treats the button as optional but complete when present", () => {
    const { button: _button, ...withoutButton } = validSlot.content;
    expect(parseSlotInput({ ...validSlot, content: withoutButton })).toHaveProperty("value");
    expect(
      parseSlotInput({
        ...validSlot,
        content: { ...validSlot.content, button: { label: "", action: validSlot.content.button.action } },
      }),
    ).toHaveProperty("errors");
    expect(
      parseSlotInput({
        ...validSlot,
        content: { ...validSlot.content, button: { label: "打开", action: { type: "open_browser", url: "" } } },
      }),
    ).toHaveProperty("errors");
  });

  it("rejects missing required fields and javascript urls", () => {
    expect(parseSlotInput({ ...validSlot, content: { ...validSlot.content, title: undefined } })).toHaveProperty(
      "errors",
    );
    expect(
      parseSlotInput({
        ...validSlot,
        target: { ...validSlot.target, imageUrl: "javascript:alert(1)" },
      }),
    ).toHaveProperty("errors");
  });

  it("rejects empty details values and non-menu placements", () => {
    expect(
      parseSlotInput({
        ...validSlot,
        content: { ...validSlot.content, details: [{ label: "", value: "x" }] },
      }),
    ).toHaveProperty("errors");
    expect(parseSlotInput({ ...validSlot, placement: "sidebar" })).toHaveProperty("errors");
  });
});

describe("slot visibility", () => {
  const stored = {
    ...validSlot,
    dismissible: true,
    startsAt: null,
    endsAt: null,
    id: "59304605-01b6-4787-897f-8c7184bb54fc",
    createdAt: "2026-09-09T00:00:00.000Z",
    updatedAt: "2026-09-09T00:00:00.000Z",
  };

  it("maps language and locale", () => {
    expect(clientLocale("zh-CN,zh;q=0.9")).toBe("zh-CN");
    expect(clientLocale("en-US,en;q=0.8")).toBe("en-US");
    expect(slotMatchesLocale({ ...stored, locale: "zh-CN" }, "en-US")).toBe(false);
    expect(slotMatchesLocale({ ...stored, locale: "all" }, "en-US")).toBe(true);
  });

  it("honors the scheduling window", () => {
    expect(slotVisibleNow(stored, "2026-09-09T12:00:00.000Z")).toBe(true);
    expect(
      slotVisibleNow({ ...stored, startsAt: "2026-09-10T00:00:00.000Z" }, "2026-09-09T12:00:00.000Z"),
    ).toBe(false);
    expect(
      slotVisibleNow({ ...stored, endsAt: "2026-09-01T00:00:00.000Z" }, "2026-09-09T12:00:00.000Z"),
    ).toBe(false);
  });

  it("hides buttonless slots from clients that require a button", () => {
    const { button: _button, ...withoutButton } = stored.content;
    const buttonless = { ...stored, content: withoutButton };
    expect(slotSupportedByClient(buttonless, "1.0.0")).toBe(false);
    expect(slotSupportedByClient(buttonless, "0.1.7")).toBe(false);
    expect(slotSupportedByClient(buttonless, "1.0.1")).toBe(true);
    expect(slotSupportedByClient(stored, "0.1.7")).toBe(true);
  });

  it("honors past dismissals only for dismissible slots", () => {
    const dismissed = new Set([stored.id]);
    expect(slotDismissedByClient(stored, dismissed)).toBe(true);
    expect(slotDismissedByClient({ ...stored, dismissible: false }, dismissed)).toBe(false);
    expect(slotDismissedByClient(stored, new Set())).toBe(false);
  });

  it("defaults new slots to dismissible", () => {
    expect(parseSlotInput(validSlot)).toMatchObject({ value: { dismissible: true } });
    expect(parseSlotInput({ ...validSlot, dismissible: false })).toMatchObject({ value: { dismissible: false } });
  });

  it("emits the public contract shape", () => {
    expect(toPublicSlot(stored)).toEqual({
      id: stored.id,
      enabled: true,
      dismissible: true,
      placement: "menu",
      target: stored.target,
      content: stored.content,
    });
  });
});
