import type { Root } from "mdast";
import { ResearchInfo, ResearchSource } from "@/types/chat";

export function sourceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function sourceDomain(value: string): string {
  try { return new URL(value).hostname.replace(/^www\./, ""); }
  catch { return "Source"; }
}

export function parseResearchInfo(value: unknown): ResearchInfo {
  if (!value || typeof value !== "object") throw new Error("Invalid search metadata.");
  const data = value as Record<string, unknown>;
  if (typeof data.query !== "string" || typeof data.provider !== "string" || !Array.isArray(data.sources)) {
    throw new Error("Invalid search metadata.");
  }
  const sources: ResearchSource[] = [];
  for (const item of data.sources) {
    if (!item || typeof item !== "object") continue;
    const source = item as Record<string, unknown>;
    if (typeof source.id !== "number" || !Number.isInteger(source.id) || source.id < 1 ||
        typeof source.title !== "string" || typeof source.url !== "string" || !sourceUrl(source.url)) continue;
    sources.push({ id: source.id, title: source.title, url: source.url,
      snippet: typeof source.snippet === "string" ? source.snippet : "",
      published_date: typeof source.published_date === "string" ? source.published_date : null });
  }
  return { query: data.query, provider: data.provider, cached: data.cached === true,
    depth: data.depth === "deep" ? "deep" : "standard", pages_read: typeof data.pages_read === "number" ? data.pages_read : 0,
    warning: typeof data.warning === "string" ? data.warning : null, sources };
}

export function downloadResearchReport(content: string, research: ResearchInfo, warning?: string) {
  const references = research.sources.map((source) => `[${source.id}]: ${source.url}`).join("\n");
  const sources = research.sources.map((source) => `${source.id}. [${source.title.replace(/[\[\]]/g, "")}](<${source.url}>)${source.published_date ? ` — ${source.published_date}` : ""}`).join("\n");
  const report = `# Research report\n\n**Question:** ${research.query}\n\n${warning ? `**Incomplete report:** ${warning}\n\n` : ""}${research.warning ? `**Source limitation:** ${research.warning}\n\n` : ""}${content}\n\n## Sources\n\n${sources}\n\n${references}\n\n---\nExported ${new Date().toISOString()} · ${research.provider} · ${research.pages_read ?? 0} full pages read\n`;
  const url = URL.createObjectURL(new Blob([report], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url;
  link.download = `${research.query.replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 64) || "research"}-report.md`;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface CitationNode {
  type: string;
  value?: string;
  url?: string;
  children?: CitationNode[];
}

// Link plain [1] citations only when they refer to actual retrieved sources.
// Walking Markdown nodes leaves code, existing links, and images untouched.
export function citationPlugin(sources: ResearchSource[]) {
  const urls = new Map(sources.map((source) => [source.id, sourceUrl(source.url)]));
  return function attach() {
    return function transform(tree: Root) {
      function rewrite(node: CitationNode) {
        if (["link", "linkReference", "code", "inlineCode", "image", "imageReference"].includes(node.type) || !node.children) return;
        node.children = node.children.flatMap((child) => {
          if (child.type !== "text" || !child.value) { rewrite(child); return [child]; }
          const parts: CitationNode[] = [];
          let offset = 0;
          for (const match of child.value.matchAll(/\[(\d+)\]/g)) {
            const url = urls.get(Number(match[1]));
            if (!url || match.index === undefined) continue;
            if (match.index > offset) parts.push({ type: "text", value: child.value.slice(offset, match.index) });
            parts.push({ type: "link", url, children: [{ type: "text", value: match[1] }] });
            offset = match.index + match[0].length;
          }
          if (!parts.length) return [child];
          if (offset < child.value.length) parts.push({ type: "text", value: child.value.slice(offset) });
          return parts;
        });
      }
      rewrite(tree);
    };
  };
}
