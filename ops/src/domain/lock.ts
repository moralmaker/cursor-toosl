export const IP_MAX_ATTEMPTS = 5;
export const IP_LOCK_SECONDS = 15 * 60;
export const ACCOUNT_MAX_ATTEMPTS = 20;
export const ACCOUNT_WINDOW_SECONDS = 60 * 60;
export const ACCOUNT_LOCK_SECONDS = 60 * 60;

export type AttemptKind = "ip" | "account";

export type AttemptRow = {
  key: string;
  attempts: number;
  lockedUntil: string | null;
  windowStart: string | null;
  updatedAt: string;
};

export type LockDecision =
  | { blocked: true; retryAfterSeconds: number }
  | { blocked: false };

export function isLocked(row: AttemptRow | null, nowMs: number): LockDecision {
  if (!row?.lockedUntil) {
    return { blocked: false };
  }
  const until = Date.parse(row.lockedUntil);
  if (Number.isNaN(until) || until <= nowMs) {
    return { blocked: false };
  }
  return { blocked: true, retryAfterSeconds: Math.ceil((until - nowMs) / 1000) };
}

export function nextFailureState(
  kind: AttemptKind,
  row: AttemptRow | null,
  key: string,
  nowMs: number,
): AttemptRow {
  const nowIso = new Date(nowMs).toISOString();
  if (kind === "ip") {
    const attempts = (row && !expiredLock(row, nowMs) ? row.attempts : 0) + 1;
    if (attempts >= IP_MAX_ATTEMPTS) {
      return {
        key,
        attempts: 0,
        lockedUntil: new Date(nowMs + IP_LOCK_SECONDS * 1000).toISOString(),
        windowStart: null,
        updatedAt: nowIso,
      };
    }
    return {
      key,
      attempts,
      lockedUntil: null,
      windowStart: null,
      updatedAt: nowIso,
    };
  }

  const windowFresh =
    row?.windowStart && nowMs - Date.parse(row.windowStart) < ACCOUNT_WINDOW_SECONDS * 1000;
  const attempts = (windowFresh ? row.attempts : 0) + 1;
  if (attempts >= ACCOUNT_MAX_ATTEMPTS) {
    return {
      key,
      attempts: 0,
      lockedUntil: new Date(nowMs + ACCOUNT_LOCK_SECONDS * 1000).toISOString(),
      windowStart: nowIso,
      updatedAt: nowIso,
    };
  }
  return {
    key,
    attempts,
    lockedUntil: null,
    windowStart: windowFresh && row?.windowStart ? row.windowStart : nowIso,
    updatedAt: nowIso,
  };
}

function expiredLock(row: AttemptRow, nowMs: number): boolean {
  return Boolean(row.lockedUntil && Date.parse(row.lockedUntil) <= nowMs);
}
