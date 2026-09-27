"use client";

import { useEffect, useState } from "react";
import { BookHeart, Plus, RotateCcw, Settings, SlidersHorizontal, Trash2, Wifi, X } from "lucide-react";
import { API_BASE_URL, fetchMemories, addMemory, deleteMemory, Memory } from "@/lib/api";
import { UserSettings } from "@/types/chat";

interface Props {
  open: boolean;
  settings: UserSettings;
  onChange: (settings: UserSettings) => void;
  onReset: () => void;
  onClose: () => void;
}

export default function SettingsModal({ open, settings, onChange, onReset, onClose }: Props) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [memoryError, setMemoryError] = useState("");

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      fetchMemories()
        .then((items) => {
          setMemories(items);
          setMemoryError("");
        })
        .catch(() => setMemoryError("Could not load saved memories. Check that the backend is available."));
    }
  }, [open]);

  async function handleAddMemory() {
    const key = newKey.trim();
    const value = newValue.trim();
    if (!key || !value) return;
    try {
      const memory = await addMemory(key, value);
      setMemories((prev) => {
        const existingIndex = prev.findIndex((item) => item.key === memory.key);
        if (existingIndex < 0) return [...prev, memory].sort((a, b) => a.key.localeCompare(b.key));
        return prev.map((item, index) => index === existingIndex ? memory : item);
      });
      setNewKey("");
      setNewValue("");
      setMemoryError("");
    } catch {
      setMemoryError("Could not save this memory. Check that the backend is available and try again.");
    }
  }

  async function handleDeleteMemory(id: number) {
    try {
      await deleteMemory(id);
      setMemories((prev) => prev.filter((m) => m.id !== id));
      setMemoryError("");
    } catch {
      setMemoryError("Could not remove this memory. Try again.");
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 px-3 py-3 backdrop-blur-sm sm:px-5 sm:py-6"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        className="max-h-full w-full max-w-2xl overflow-hidden rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface)] shadow-2xl shadow-slate-950/20"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#315b49] text-white dark:bg-[#b5d9c1] dark:text-[#193c2d]">
              <Settings size={18} />
            </span>
            <div>
              <h2 id="settings-title" className="text-base font-semibold text-slate-950 dark:text-white">
                Settings
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Make responses feel right for you.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white"
            aria-label="Close settings"
          >
            <X size={17} />
          </button>
        </div>

        <div className="max-h-[calc(92dvh-5rem)] space-y-4 overflow-y-auto p-4 sm:p-6">
          <div className="rounded-2xl border border-[var(--border)] bg-white/65 p-4 sm:p-5 dark:bg-slate-900/50">
            <div className="mb-4 flex items-center gap-2">
              <SlidersHorizontal size={16} className="text-[#315b49] dark:text-[#b5d9c1]" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Generation</h3>
            </div>

            <label className="block">
              <span className="flex items-center justify-between text-sm font-medium text-slate-700 dark:text-slate-200">
                Temperature
                <span className="text-xs text-slate-500">{settings.temperature.toFixed(1)}</span>
              </span>
              <input
                type="range"
                min="0"
                max="1.5"
                step="0.1"
                value={settings.temperature}
                onChange={(event) => onChange({ ...settings, temperature: Number(event.target.value) })}
                className="mt-3 w-full accent-[#315b49] dark:accent-[#b5d9c1]"
              />
            </label>

            <label className="mt-5 block">
              <span className="flex items-center justify-between text-sm font-medium text-slate-700 dark:text-slate-200">
                Max tokens
                <span className="text-xs text-slate-500">{settings.maxTokens}</span>
              </span>
              <input
                type="range"
                min="128"
                max="16384"
                step="128"
                value={settings.maxTokens}
                onChange={(event) => onChange({ ...settings, maxTokens: Number(event.target.value) })}
                className="mt-3 w-full accent-[#315b49] dark:accent-[#b5d9c1]"
              />
            </label>

            <div className="mt-5 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Response style">
              {(["balanced", "concise", "detailed"] as const).map((style) => (
                <button
                  key={style}
                  type="button"
                  onClick={() => onChange({ ...settings, systemStyle: style })}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium capitalize transition ${
                    settings.systemStyle === style
                      ? "border-[#789a7c] bg-[#edf3eb] text-[#284c37] dark:bg-[#b5d9c1]/10 dark:text-[#c5e2ce]"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
                  }`}
                  role="radio"
                  aria-checked={settings.systemStyle === style}
                >
                  {style}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-white/65 p-4 sm:p-5 dark:bg-slate-900/50">
            <div className="mb-4 flex items-center gap-2">
              <BookHeart size={16} className="text-[#315b49] dark:text-[#b5d9c1]" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Memory</h3>
            </div>

            {memoryError ? <p role="status" className="mb-3 text-xs text-rose-700 dark:text-rose-300">{memoryError}</p> : null}

            <div className="mb-3 flex gap-2">
              <input
                type="text"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") void handleAddMemory(); }}
                placeholder="Key (e.g. name)"
                className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#789a7c] dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500"
              />
              <input
                type="text"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") void handleAddMemory(); }}
                placeholder="Value (e.g. Abdou)"
                className="min-w-0 flex-[2] rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#789a7c] dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={handleAddMemory}
                disabled={!newKey.trim() || !newValue.trim()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#315b49] text-white transition hover:bg-[#264b39] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:bg-[#b5d9c1] dark:text-[#193c2d] dark:disabled:bg-slate-800 dark:disabled:text-slate-600"
                aria-label="Save memory"
              >
                <Plus size={16} />
              </button>
            </div>

            {memories.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No memories yet. Add some so the AI remembers facts about you.</p>
            ) : (
              <div className="max-h-48 space-y-1.5 overflow-y-auto">
                {memories.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
                    <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                      {m.key}
                    </span>
                    <span className="flex-1 truncate text-sm text-slate-800 dark:text-slate-200">{m.value}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteMemory(m.id)}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-200 hover:text-rose-600 dark:hover:bg-slate-700 dark:hover:text-rose-400"
                      aria-label={`Delete memory ${m.key}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-white/65 p-4 sm:p-5 dark:bg-slate-900/50">
            <div className="mb-3 flex items-center gap-2">
              <Wifi size={16} className="text-[#315b49] dark:text-[#b5d9c1]" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Connection</h3>
            </div>
            <p className="break-all rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">
              {API_BASE_URL}
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-500">
              Leave <code>NEXT_PUBLIC_API_URL</code> blank for LAN mode, or set it when the backend runs on another host.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={settings.webSearch}
                  onChange={(event) => onChange({ ...settings, webSearch: event.target.checked })}
                  className="accent-[#315b49] dark:accent-[#b5d9c1]"
                />
                Web research for current info
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={settings.markdownRich}
                  onChange={(event) => onChange({ ...settings, markdownRich: event.target.checked })}
                  className="accent-[#315b49] dark:accent-[#b5d9c1]"
                />
                Rich Markdown
              </label>
            </div>

            <button
              type="button"
              onClick={onReset}
              className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-white dark:text-slate-300 dark:hover:bg-slate-900"
            >
              <RotateCcw size={15} />
              Reset
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
