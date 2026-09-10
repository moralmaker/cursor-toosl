export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("X-Requested-With", "XMLHttpRequest");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "same-origin",
  });
  if (response.status === 204) {
    return undefined as T;
  }
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new ApiError(response.status, payload.error || `HTTP ${response.status}`);
  }
  return payload as T;
}

export type SlotRecord = {
  id: string;
  enabled: boolean;
  placement: "menu";
  locale: "all" | "zh-CN" | "en-US";
  sortOrder: number;
  startsAt: string | null;
  endsAt: string | null;
  target: { title: string; description: string; imageUrl: string };
  content: {
    title: string;
    description: string;
    imageUrl: string;
    details: { label: string; value: string }[];
    button: { label: string; action: { type: "open_browser"; url: string } };
  };
  createdAt: string;
  updatedAt: string;
};

export type ReleaseAsset = {
  id?: number;
  kind: "installer" | "portable";
  platform: string;
  url: string;
  signature: string;
};

export type ReleaseRecord = {
  version: string;
  notes: string;
  pubDate: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  assets: ReleaseAsset[];
};

export const api = {
  login: (body: { username: string; password: string; totp?: string }) =>
    request<{ ok: boolean }>("/api/admin/login", { method: "POST", body: JSON.stringify(body) }),
  logout: () => request<{ ok: boolean }>("/api/admin/logout", { method: "POST" }),
  me: () => request<{ username: string; totpRequired: boolean }>("/api/admin/me"),
  slots: () => request<{ slots: SlotRecord[] }>("/api/admin/slots"),
  createSlot: (body: unknown) =>
    request<{ id: string }>("/api/admin/slots", { method: "POST", body: JSON.stringify(body) }),
  updateSlot: (id: string, body: unknown) =>
    request<{ ok: boolean }>(`/api/admin/slots/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteSlot: (id: string) => request<{ ok: boolean }>(`/api/admin/slots/${id}`, { method: "DELETE" }),
  reorderSlots: (ids: string[]) =>
    request<{ ok: boolean }>("/api/admin/slots/order", { method: "PUT", body: JSON.stringify({ ids }) }),
  releases: () => request<{ releases: ReleaseRecord[] }>("/api/admin/releases"),
  createRelease: (body: unknown) =>
    request<{ version: string }>("/api/admin/releases", { method: "POST", body: JSON.stringify(body) }),
  updateRelease: (version: string, body: unknown) =>
    request<{ ok: boolean }>(`/api/admin/releases/${encodeURIComponent(version)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteRelease: (version: string) =>
    request<{ ok: boolean }>(`/api/admin/releases/${encodeURIComponent(version)}`, { method: "DELETE" }),
  importGithub: (repository: string) =>
    request<{ version: string; assets: number }>("/api/admin/releases/import-github", {
      method: "POST",
      body: JSON.stringify({ repository }),
    }),
  dismissals: (adId?: string) =>
    request<{
      items: Array<{
        ad_id: string;
        device_id: string;
        reason: string;
        os: string | null;
        app_version: string | null;
        created_at: string;
        updated_at: string;
      }>;
      summary: Array<{ adId: string; count: number; lastReason: string; lastAt: string }>;
    }>(`/api/admin/dismissals${adId ? `?adId=${encodeURIComponent(adId)}` : ""}`),
  audit: () =>
    request<{
      items: Array<{ id: number; action: string; actor: string; detail: string | null; ip: string | null; created_at: string }>;
    }>("/api/admin/audit?limit=100"),
};
