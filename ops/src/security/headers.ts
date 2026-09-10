export function applySecurityHeaders(response: Response, path: string, secure: boolean): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (secure) {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  const isAdminSurface = path === "/admin" || path.startsWith("/admin/") || path.startsWith("/api/admin");
  if (isAdminSurface) {
    headers.set("X-Robots-Tag", "noindex, nofollow");
    headers.set(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self'",
        "img-src 'self' https: data:",
        "font-src 'self'",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'none'",
        "form-action 'self'",
      ].join("; "),
    );
  } else {
    headers.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
