// 与桌面端 server/src/control/ads.rs 的 MAX_AD_IMAGE_BYTES / IMAGE_EXTENSIONS 保持一致。
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

const CONTENT_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
} as const;

export type ImageExtension = keyof typeof CONTENT_TYPES;

export type ImageFormat = { extension: ImageExtension; contentType: string };

const IMAGE_NAME_RE = /^([0-9a-f]{64})\.(png|jpg|gif|webp|avif)$/;

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

export function sniffImage(bytes: Uint8Array): ImageFormat | null {
  const extension = detect(bytes);
  return extension ? { extension, contentType: CONTENT_TYPES[extension] } : null;
}

function detect(bytes: Uint8Array): ImageExtension | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 8) === "PNG\r\n\x1a\n") {
    return "png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpg";
  }
  if (bytes.length >= 6 && /^GIF8[79]a$/.test(ascii(bytes, 0, 6))) {
    return "gif";
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
    return "webp";
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp" && /^avi[fs]$/.test(ascii(bytes, 8, 12))) {
    return "avif";
  }
  return null;
}

export function imageObjectName(sha256: string, format: ImageFormat): string {
  return `${sha256}.${format.extension}`;
}

export function parseImageName(name: string): ImageFormat | null {
  const match = IMAGE_NAME_RE.exec(name);
  if (!match) {
    return null;
  }
  const extension = match[2] as ImageExtension;
  return { extension, contentType: CONTENT_TYPES[extension] };
}
