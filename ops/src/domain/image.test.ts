import { describe, expect, it } from "vitest";
import { imageObjectName, parseImageName, sniffImage } from "./image.ts";

function bytes(...parts: (string | number[])[]): Uint8Array {
  return new Uint8Array(
    parts.flatMap((part) => (typeof part === "string" ? [...part].map((char) => char.charCodeAt(0)) : part)),
  );
}

const HASH = "a".repeat(64);

describe("sniffImage", () => {
  it("recognizes every format the desktop client accepts", () => {
    expect(sniffImage(bytes([0x89], "PNG\r\n\x1a\n"))?.contentType).toBe("image/png");
    expect(sniffImage(bytes([0xff, 0xd8, 0xff, 0xe0]))?.extension).toBe("jpg");
    expect(sniffImage(bytes("GIF89a"))?.extension).toBe("gif");
    expect(sniffImage(bytes("RIFF", [0, 0, 0, 0], "WEBP"))?.extension).toBe("webp");
    expect(sniffImage(bytes([0, 0, 0, 0x1c], "ftypavif"))?.extension).toBe("avif");
  });

  it("rejects svg, html and truncated data regardless of declared type", () => {
    expect(sniffImage(bytes("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(sniffImage(bytes("<!doctype html>"))).toBeNull();
    expect(sniffImage(bytes([0x89], "PN"))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });
});

describe("image names", () => {
  it("round-trips a content-addressed name", () => {
    const format = sniffImage(bytes("GIF87a"))!;
    const name = imageObjectName(HASH, format);
    expect(name).toBe(`${HASH}.gif`);
    expect(parseImageName(name)).toEqual(format);
  });

  it("rejects traversal, unknown extensions and short hashes", () => {
    expect(parseImageName(`../${HASH}.png`)).toBeNull();
    expect(parseImageName(`${HASH}.svg`)).toBeNull();
    expect(parseImageName("abc.png")).toBeNull();
    expect(parseImageName(`${HASH.toUpperCase()}.png`)).toBeNull();
  });
});
