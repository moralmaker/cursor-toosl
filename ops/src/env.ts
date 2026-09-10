export type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD_HASH: string;
  SIGNING_SECRET: string;
  ADMIN_TOTP_SECRET?: string;
  PUBLIC_CACHE_TTL: string;
};

export type AdminSession = {
  id: string;
  expiresAt: string;
  ip: string | null;
};
