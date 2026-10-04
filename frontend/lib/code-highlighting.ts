import { common, createLowlight } from "lowlight";
import type { RootContent } from "hast";

const highlighter = createLowlight(common);
highlighter.registerAlias({ javascript: ["jsx"], typescript: ["tsx"] });

const languageInfo: Record<string, [label: string, extension: string]> = {
  bash: ["Bash", "sh"], sh: ["Shell", "sh"], shell: ["Shell", "sh"],
  c: ["C", "c"], cpp: ["C++", "cpp"], cs: ["C#", "cs"], csharp: ["C#", "cs"],
  css: ["CSS", "css"], scss: ["SCSS", "scss"],
  html: ["HTML", "html"], xml: ["XML", "xml"], svg: ["SVG", "svg"],
  js: ["JavaScript", "js"], javascript: ["JavaScript", "js"], jsx: ["JSX", "jsx"],
  ts: ["TypeScript", "ts"], typescript: ["TypeScript", "ts"], tsx: ["TSX", "tsx"],
  json: ["JSON", "json"], md: ["Markdown", "md"], markdown: ["Markdown", "md"],
  py: ["Python", "py"], python: ["Python", "py"],
  powershell: ["PowerShell", "ps1"], ps1: ["PowerShell", "ps1"],
  go: ["Go", "go"], rust: ["Rust", "rs"], rs: ["Rust", "rs"],
  java: ["Java", "java"], kotlin: ["Kotlin", "kt"], swift: ["Swift", "swift"],
  ruby: ["Ruby", "rb"], rb: ["Ruby", "rb"], php: ["PHP", "php"],
  sql: ["SQL", "sql"], yaml: ["YAML", "yml"], yml: ["YAML", "yml"],
  dockerfile: ["Dockerfile", "dockerfile"], diff: ["Diff", "diff"],
  text: ["Plain text", "txt"], txt: ["Plain text", "txt"], plaintext: ["Plain text", "txt"],
};

export function describeLanguage(language: string) {
  const normalized = language.toLowerCase();
  const [label, extension] = languageInfo[normalized] ?? [language || "Plain text", "txt"];
  return { label, filename: extension === "dockerfile" ? "Dockerfile" : `snippet.${extension}` };
}

interface CodeToken {
  text: string;
  className?: string;
}

export function highlightLines(code: string, language: string): CodeToken[][] {
  const plainLines = () => code.split("\n").map((text) => [{ text }]);
  // Bound highlighting work while large answers are streaming. Source is never truncated.
  if (code.length > 50_000 || !highlighter.registered(language.toLowerCase())) return plainLines();

  try {
    const tree = highlighter.highlight(language.toLowerCase(), code);
    const lines: CodeToken[][] = [[]];
    function visit(nodes: RootContent[], classes: string[] = []) {
      for (const node of nodes) {
        if (node.type === "text") {
          node.value.split("\n").forEach((text, index) => {
            if (index > 0) lines.push([]);
            if (text) lines[lines.length - 1].push({ text, className: classes.join(" ") || undefined });
          });
        } else if (node.type === "element") {
          const names = node.properties.className;
          visit(node.children, [...classes, ...(Array.isArray(names) ? names.map(String) : [])]);
        }
      }
    }
    visit(tree.children);
    return lines;
  } catch {
    // Incomplete or unsupported snippets must still be readable and copyable.
    return plainLines();
  }
}
