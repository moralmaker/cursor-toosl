import { compareSemver } from "./semver.ts";
import type { StoredRelease } from "./release.ts";

export type ChangelogListItem = {
  version: string;
  pubDate: string;
  title: string;
  summary: string;
};

export type ChangelogDetail = {
  version: string;
  pubDate: string;
  title: string;
  notes: string;
  body: string;
  html: string;
};

export function isChangelogPublic(release: StoredRelease): boolean {
  return release.published && release.changelogVisible && release.changelogBody.trim().length > 0;
}

export function toChangelogListItem(release: StoredRelease): ChangelogListItem {
  const title = release.changelogTitle.trim() || `Cursor TOOLS ${release.version}`;
  const notes = release.notes.trim();
  // GitHub 默认 notes 不适合做公开摘要，优先用 changelog 正文。
  const summarySource =
    notes && !/^download the installer/i.test(notes) ? notes : release.changelogBody;
  return {
    version: release.version,
    pubDate: release.pubDate,
    title,
    summary: summarize(summarySource, 160),
  };
}

export function toChangelogDetail(release: StoredRelease): ChangelogDetail {
  const body = release.changelogBody;
  const title = release.changelogTitle.trim() || `Cursor TOOLS ${release.version}`;
  return {
    version: release.version,
    pubDate: release.pubDate,
    title,
    notes: release.notes,
    body,
    html: renderMarkdown(body),
  };
}

export function sortChangelog(releases: StoredRelease[]): StoredRelease[] {
  return releases
    .filter(isChangelogPublic)
    .sort((left, right) => compareSemver(right.version, left.version));
}

export function summarize(text: string, max = 160): string {
  const flat = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*`|_\[\]()!-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (flat.length <= max) {
    return flat;
  }
  return `${flat.slice(0, max - 1).trimEnd()}…`;
}

/** 安全 Markdown 子集：标题、段落、列表、引用、表格、链接、图片、行内 code。不解析原始 HTML。 */
export function renderMarkdown(source: string): string {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (/^###\s+/.test(line)) {
      html.push(heading("h3", line.replace(/^###\s+/, "")));
      i += 1;
      continue;
    }
    if (/^##\s+/.test(line)) {
      html.push(heading("h2", line.replace(/^##\s+/, "")));
      i += 1;
      continue;
    }
    if (/^#\s+/.test(line)) {
      html.push(heading("h1", line.replace(/^#\s+/, "")));
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i] ?? "")) {
        quote.push((lines[i] ?? "").replace(/^>\s?/, ""));
        i += 1;
      }
      html.push(`<blockquote><p>${inline(quote.join(" "))}</p></blockquote>`);
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i] ?? "")) {
        items.push(`<li>${inline((lines[i] ?? "").replace(/^[-*]\s+/, ""))}</li>`);
        i += 1;
      }
      html.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i] ?? "")) {
        items.push(`<li>${inline((lines[i] ?? "").replace(/^\d+\.\s+/, ""))}</li>`);
        i += 1;
      }
      html.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    if (looksLikeTable(line, lines[i + 1])) {
      const header = splitTableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? "").includes("|") && (lines[i] ?? "").trim()) {
        rows.push(splitTableRow(lines[i] ?? ""));
        i += 1;
      }
      html.push(
        `<div class="table-wrap"><table><thead><tr>${header
          .map((cell) => `<th>${inline(cell)}</th>`)
          .join("")}</tr></thead><tbody>${rows
          .map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table></div>`,
      );
      continue;
    }

    const para: string[] = [line];
    i += 1;
    while (i < lines.length && (lines[i] ?? "").trim() && !isBlockStart(lines[i] ?? "")) {
      para.push(lines[i] ?? "");
      i += 1;
    }
    html.push(`<p>${inline(para.join(" "))}</p>`);
  }

  return html.join("\n");
}

function isBlockStart(line: string): boolean {
  return (
    /^#{1,3}\s+/.test(line) ||
    /^>\s?/.test(line) ||
    /^[-*]\s+/.test(line) ||
    /^\d+\.\s+/.test(line) ||
    (line.includes("|") && /^\s*\|/.test(line))
  );
}

function looksLikeTable(header: string, separator: string | undefined): boolean {
  if (!separator || !header.includes("|")) {
    return false;
  }
  // 分隔行形如 | --- | :---: | ---: |
  return /^\s*\|?(\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(separator)
    || /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(separator);
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function heading(tag: "h1" | "h2" | "h3", raw: string): string {
  const id = slugify(raw);
  return `<${tag} id="${id}">${inline(raw)}</${tag}>`;
}

function slugify(value: string): string {
  const compact = value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}-]+/gu, "");
  return compact || "section";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(value: string): string {
  let text = escapeHtml(value);
  text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
  // 先匹配图片，避免 ![说明](url) 被当成普通链接。
  text = text.replace(
    /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g,
    '<img src="$2" alt="$1" loading="lazy">',
  );
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noreferrer noopener" target="_blank">$1</a>');
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/(^|[\s(])\*([^*]+)\*(?=[\s).,]|$)/g, "$1<em>$2</em>");
  return text;
}
