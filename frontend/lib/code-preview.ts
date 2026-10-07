import { parse, parseFragment, serialize, type DefaultTreeAdapterMap } from "parse5";
import { previewEntry, type WorkspaceFile } from "./code-workspace";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
type Parent = DefaultTreeAdapterMap["parentNode"];

function elements(root: Node): Element[] {
  const found: Element[] = [];
  function visit(node: Node) {
    if ("tagName" in node) found.push(node);
    if ("childNodes" in node) node.childNodes.forEach(visit);
  }
  visit(root);
  return found;
}

function attr(node: Element, name: string) { return node.attrs.find((item) => item.name === name)?.value || ""; }
function remove(node: Element) {
  if (node.parentNode) node.parentNode.childNodes = node.parentNode.childNodes.filter((child) => child !== node);
  node.parentNode = null;
}
function append(parent: Parent, node: Element, first = false) {
  remove(node);
  if (first) parent.childNodes.unshift(node); else parent.childNodes.push(node);
  node.parentNode = parent;
}
function make(tag: string, attrs: Record<string, string> = {}, text?: string): Element {
  const node = parseFragment(`<${tag}></${tag}>`).childNodes[0] as Element;
  node.attrs = Object.entries(attrs).map(([name, value]) => ({ name, value }));
  if (text !== undefined) node.childNodes = [{ nodeName: "#text", value: text, parentNode: node }];
  return node;
}
function resolveFile(files: WorkspaceFile[], path: string, entry: string) {
  if (/^(?:[a-z]+:|\/\/|#)/i.test(path)) return undefined;
  const resolved = new URL(path, new URL(entry, "https://workspace.invalid/")).pathname.slice(1);
  return files.find((file) => file.name === resolved) || files.find((file) => file.name === path.replace(/^\.\//, ""));
}

export function buildPreview(files: WorkspaceFile[], entryName: string, externalAssets: boolean, channel: string): string {
  const entry = files.find((file) => file.name === entryName) || previewEntry(files);
  // A pure parser avoids creating live DOM nodes or fetching page resources
  // while preparing generated markup in the main chat page.
  const document = parse(entry?.content || "<!doctype html><html><head><title>Preview</title></head><body></body></html>");
  const nodes = elements(document);
  const head = nodes.find((node) => node.tagName === "head")!;
  const body = nodes.find((node) => node.tagName === "body")!;
  const used = new Set<string>();
  for (const node of nodes) {
    if (node.tagName === "base" || (node.tagName === "meta" && ["content-security-policy", "refresh"].includes(attr(node, "http-equiv").toLowerCase()))) {
      remove(node);
    } else if (node.tagName === "link" && attr(node, "rel").toLowerCase() === "stylesheet") {
      const file = resolveFile(files, attr(node, "href"), entry?.name || "index.html");
      if (!file) continue;
      const parent = node.parentNode!;
      const index = parent.childNodes.indexOf(node);
      const style = make("style", {}, file.content.replace(/<\/style/gi, "<\\/style"));
      remove(node);
      parent.childNodes.splice(index, 0, style);
      style.parentNode = parent;
      used.add(file.name);
    } else if (node.tagName === "script" && attr(node, "src")) {
      const file = resolveFile(files, attr(node, "src"), entry?.name || "index.html");
      if (!file) continue;
      node.attrs = node.attrs.filter((item) => !["src", "integrity"].includes(item.name));
      node.childNodes = [{ nodeName: "#text", value: file.content.replace(/<\/script/gi, "<\\/script"), parentNode: node }];
      if (attr(node, "type") !== "module" && node.attrs.some((item) => ["defer", "async"].includes(item.name))) append(body, node);
      used.add(file.name);
    }
  }
  for (const file of files) {
    if (used.has(file.name)) continue;
    if (file.language === "css" || file.name.endsWith(".css")) {
      append(head, make("style", {}, file.content.replace(/<\/style/gi, "<\\/style")));
    } else if (["javascript", "js"].includes(file.language) || /\.js$/i.test(file.name)) {
      append(body, make("script", {}, file.content.replace(/<\/script/gi, "<\\/script")));
    }
  }
  if (!nodes.some((node) => node.tagName === "meta" && attr(node, "name").toLowerCase() === "viewport")) {
    append(head, make("meta", { name: "viewport", content: "width=device-width, initial-scale=1" }), true);
  }
  const monitor = `(() => { const report = message => parent.postMessage({ type: 'localgpt-preview-error', channel: ${JSON.stringify(channel)}, message: String(message).slice(0, 600) }, '*'); const format = value => { try { return typeof value === 'string' ? value : JSON.stringify(value) ?? String(value); } catch { return String(value); } }; ['log', 'info', 'warn', 'error'].forEach(level => { const original = console[level]; console[level] = (...values) => { report('[' + level + '] ' + values.map(format).join(' ')); original.apply(console, values); }; }); window.addEventListener('error', e => report('[error] ' + (e.message || 'A script could not load.'))); window.addEventListener('unhandledrejection', e => report('[error] ' + (e.reason?.message || e.reason || 'Unhandled promise rejection'))); })();`;
  append(head, make("script", {}, monitor), true);
  const remote = externalAssets ? " https:" : "";
  const policy = `default-src 'none'; script-src 'unsafe-inline' blob: data:${remote}; style-src 'unsafe-inline'${remote}; img-src data: blob:${remote}; font-src data:${remote}; media-src data: blob:${remote}; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
  append(head, make("meta", { "http-equiv": "Content-Security-Policy", content: policy }), true);
  const html = serialize(document);
  return /^<!doctype/i.test(html) ? html : "<!doctype html>\n" + html;
}
