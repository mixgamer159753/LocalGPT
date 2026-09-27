"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Cpu,
  Menu,
  RefreshCw,
  Search,
} from "lucide-react";
import { fetchHealth, fetchModels } from "@/lib/api";
import { HealthInfo, ModelInfo } from "@/types/chat";

interface Props {
  onToggleSidebar: () => void;
  model: string;
  onModelChange: (model: string, automatic?: boolean) => void;
  disabled?: boolean;
}

function splitModelName(name: string) {
  const [family, ...rest] = name.split(":");
  return { family, version: rest.join(":") };
}

function formatBytes(size?: number | null) {
  if (!size) {
    return "";
  }
  const gb = size / 1024 / 1024 / 1024;
  return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`;
}

function modelMeta(model: ModelInfo) {
  return [
    model.family,
    model.parameter_size,
    model.quantization_level,
    formatBytes(model.size),
  ].filter(Boolean).join(" / ");
}

export default function Header({ onToggleSidebar, model, onModelChange, disabled }: Props) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [healthUnavailable, setHealthUnavailable] = useState(false);
  const [llmOnline, setLlmOnline] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loadingModels, setLoadingModels] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const refreshModels = useCallback(async () => {
    setLoadingModels(true);
    try {
      const list = await fetchModels();
      setModels(list);
      setLlmOnline(true);
    } catch {
      setLlmOnline(false);
      setModels([]);
    } finally {
      setLoadingModels(false);
    }
  }, []);

  const refreshHealth = useCallback(async () => {
    try {
      const nextHealth = await fetchHealth();
      setHealth(nextHealth);
      setHealthUnavailable(false);
      setLlmOnline(nextHealth.ollama_reachable);
    } catch {
      setHealthUnavailable(true);
      setLlmOnline(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refreshModels();
      void refreshHealth();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [refreshModels, refreshHealth]);

  useEffect(() => {
    if (!dropdownOpen) {
      return;
    }

    const handler = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  const current = splitModelName(model);
  const activeInstalled = models.some((candidate) => candidate.name === model);

  useEffect(() => {
    if (models.length > 0 && !activeInstalled) {
      onModelChange(models[0].name, true);
    }
  }, [activeInstalled, models, onModelChange]);
  const filteredModels = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return models;
    }
    return models.filter((candidate) =>
      `${candidate.name} ${modelMeta(candidate)}`.toLowerCase().includes(normalized),
    );
  }, [models, query]);

  return (
    <header className="z-20 shrink-0 border-b border-[var(--border)]/80 bg-[var(--surface)]/85 backdrop-blur-xl">
      <div className="flex min-h-[4.25rem] items-center justify-between gap-3 px-3.5 sm:px-5 md:px-7">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 md:hidden dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white"
            aria-label="Toggle sidebar"
          >
            <Menu size={18} />
          </button>

          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
              Local workspace
              <span className={`inline-block h-2 w-2 rounded-full ${health === null ? "bg-amber-400" : health.status === "ok" ? "bg-emerald-500" : "bg-rose-400"}`} />
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {current.family}
              {current.version ? <span className="text-slate-400 dark:text-slate-500">:{current.version}</span> : null}
              {!activeInstalled && models.length > 0 ? (
                <span className="ml-2 text-amber-700 dark:text-amber-300">not installed</span>
              ) : null}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen((open) => !open)}
              disabled={disabled}
              className="flex h-10 max-w-[12rem] items-center gap-2 rounded-xl border border-[var(--border)] bg-white/80 px-3 text-xs font-medium text-slate-700 shadow-sm transition hover:border-[#b7cdb9] hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-[#456c53]"
              aria-expanded={dropdownOpen}
              aria-haspopup="listbox"
            >
              <Cpu size={14} className="text-[#315b49] dark:text-[#b5d9c1]" />
              <span className="max-w-[9rem] truncate">{model}</span>
              <ChevronDown size={14} className={`transition ${dropdownOpen ? "rotate-180" : ""}`} />
            </button>

            {dropdownOpen ? (
              <div className="absolute right-0 top-full z-50 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/12 dark:border-slate-800 dark:bg-slate-950">
                <div className="border-b border-slate-100 p-3 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">Local models</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {llmOnline ? `${models.length} detected` : "LLM is offline"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void refreshModels()}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white"
                      aria-label="Refresh models"
                    >
                      <RefreshCw size={15} className={loadingModels ? "animate-spin" : ""} />
                    </button>
                  </div>
                  <div className="relative mt-3">
                    <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search installed models"
                      className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>

                {!llmOnline ? (
                  <div className="p-5 text-sm text-slate-600 dark:text-slate-300">
                    <AlertCircle size={18} className="mb-3 text-rose-500" />
                    LLM provider is offline. Start LM Studio (or Ollama) and refresh.
                  </div>
                ) : models.length === 0 ? (
                  <div className="p-5 text-sm text-slate-600 dark:text-slate-300">
                    <AlertCircle size={18} className="mb-3 text-amber-500" />
                    No models detected. Load a model in LM Studio (or <code className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-900">ollama pull</code>).
                  </div>
                ) : (
                  <div className="max-h-80 overflow-y-auto p-1.5" role="listbox">
                    {filteredModels.length === 0 ? (
                      <p className="px-3 py-5 text-center text-sm text-slate-500 dark:text-slate-400">No matching models.</p>
                    ) : filteredModels.map((candidate) => {
                      const isActive = candidate.name === model;
                      const name = splitModelName(candidate.name);
                      return (
                        <button
                          key={candidate.name}
                          type="button"
                          onClick={() => {
                            onModelChange(candidate.name);
                            setDropdownOpen(false);
                          }}
                          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition ${
                            isActive
                              ? "bg-teal-50 text-teal-900 dark:bg-teal-400/10 dark:text-teal-100"
                              : "text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900"
                          }`}
                          role="option"
                          aria-selected={isActive}
                        >
                          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                            <Cpu size={15} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{name.family}</span>
                            <span className="block truncate text-xs text-slate-500 dark:text-slate-500">
                              {name.version || candidate.name}
                            </span>
                            {modelMeta(candidate) ? (
                              <span className="mt-0.5 block truncate text-[11px] text-slate-400 dark:text-slate-600">
                                {modelMeta(candidate)}
                              </span>
                            ) : null}
                          </span>
                          {isActive ? <Check size={16} className="text-teal-600 dark:text-teal-300" /> : null}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div
            className={`hidden h-9 items-center gap-2 rounded-full border px-3 text-xs font-medium sm:flex ${
              health?.status === "ok"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"
                : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200"
            }`}
            title={healthUnavailable ? "The backend health check failed" : health?.database_connected === false ? health.database_detail || "Database unavailable" : health?.ollama_reachable === false ? health.ollama_detail || "Model provider unavailable" : undefined}
          >
            <span className={`h-2 w-2 rounded-full ${healthUnavailable || health?.status === "degraded" ? "bg-rose-500" : health === null ? "bg-amber-400" : "bg-emerald-500"}`} />
            {healthUnavailable ? "Backend offline" : health === null ? "Connecting" : health.database_connected === false ? "Database issue" : health.ollama_reachable === false ? "Model offline" : "Ready"}
          </div>

        </div>
      </div>
    </header>
  );
}
