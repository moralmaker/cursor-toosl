import { describe, expect, it } from "vitest";
import { renderMarkdown, summarize } from "./changelog.ts";

describe("renderMarkdown", () => {
  it("renders headings lists quotes and links safely", () => {
    const html = renderMarkdown(`## 新功能\n\n- 一项 **加粗**\n- 链接 [下载](https://ops.susuan.ai/download/)\n\n> 升级须知\n\n用 \`code\` 与 <script>`);
    expect(html).toContain("<h2 id=");
    expect(html).toContain("<ul>");
    expect(html).toContain("<strong>加粗</strong>");
    expect(html).toContain('href="https://ops.susuan.ai/download/"');
    expect(html).toContain("<blockquote>");
    expect(html).toContain("<code>code</code>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders https images without allowing raw html images", () => {
    const html = renderMarkdown(
      "![面板](https://ops.susuan.ai/api/v1/images/abc.png)\n\n<img src=x onerror=alert(1)>",
    );
    expect(html).toContain(
      '<img src="https://ops.susuan.ai/api/v1/images/abc.png" alt="面板" loading="lazy">',
    );
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
  });

  it("renders tables", () => {
    const html = renderMarkdown(`| 平台 | 包 |\n| --- | --- |\n| macOS | tar.gz |`);
    expect(html).toContain("<table>");
    expect(html).toContain("<th>");
    expect(html).toContain("macOS");
  });
});

describe("summarize", () => {
  it("flattens markdown and truncates", () => {
    expect(summarize("## 标题\n\n这是一段足够长的更新说明用于截断测试", 12).endsWith("…")).toBe(true);
  });
});
