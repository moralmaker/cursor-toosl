export function isAbsoluteHttpUrl(value: string): boolean {
  if (typeof value !== "string" || value.length === 0 || value.length > 2000) {
    return false;
  }
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && Boolean(url.host);
  } catch {
    return false;
  }
}

export function isHttpsUrl(value: string): boolean {
  if (!isAbsoluteHttpUrl(value)) {
    return false;
  }
  return new URL(value).protocol === "https:";
}
