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
import { CONNECTION_EVENT, fetchHealth, fetchModels, getApiBaseUrl } from "@/lib/api";
import { HealthInfo, ModelInfo, ThinkingEffort } from "@/types/chat";

const THINKING_LEVELS: ThinkingEffort[] = ["low", "medium", "high", "max"];

interface Props {
  onToggleSidebar: () => void;
  model: string;
  thinkingEffort: ThinkingEffort;
  onThinkingEffortChange: (effort: ThinkingEffort) => void;
  onModelChange: (model: string, automatic?: boolean) => void;
  disabled?: boolean;
  onOpenConnection: () => void;
  projectName?: string;
}

function splitModelName(name: string) {
  const displayName = name.slice(name.lastIndexOf("/") + 1);
  const [family, ...rest] = displayName.split(":");
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

export default function Header({ onToggleSidebar, model, thinkingEffort, onThinkingEffortChange, onModelChange, disabled, onOpenConnection, projectName }: Props) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [healthUnavailable, setHealthUnavailable] = useState(false);
  const [llmOnline, setLlmOnline] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loadingModels, setLoadingModels] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const modelsRequestRef = useRef(0);
  const healthRequestRef = useRef(0);

  const refreshModels = useCallback(async () => {
    const requestId = ++modelsRequestRef.current;
    const target = getApiBaseUrl();
    setLoadingModels(true);
    try {
      const list = await fetchModels();
      if (requestId !== modelsRequestRef.current || target !== getApiBaseUrl()) return;
      setModels(list);
      setLlmOnline(list.length > 0);
    } catch {
      if (requestId !== modelsRequestRef.current || target !== getApiBaseUrl()) return;
      setLlmOnline(false);
      setModels([]);
    } finally {
      if (requestId === modelsRequestRef.current && target === getApiBaseUrl()) setLoadingModels(false);
    }
  }, []);

  const refreshHealth = useCallback(async () => {
    const requestId = ++healthRequestRef.current;
    const target = getApiBaseUrl();
    try {
      const nextHealth = await fetchHealth();
      if (requestId !== healthRequestRef.current || target !== getApiBaseUrl()) return;
      setHealth(nextHealth);
      setHealthUnavailable(false);
      setLlmOnline(nextHealth.ollama_reachable);
    } catch {
      if (requestId !== healthRequestRef.current || target !== getApiBaseUrl()) return;
      setHealthUnavailable(true);
      setLlmOnline(false);
    }
  }, []);

  useEffect(() => {
    const refresh = () => { void refreshModels(); void refreshHealth(); };
    const connectionChanged = () => { setModels([]); setHealth(null); setHealthUnavailable(false); refresh(); };
    const timeoutId = window.setTimeout(() => {
      if (!disabled) refresh();
    }, 0);
    const interval = window.setInterval(() => { if (document.visibilityState === "visible" && !disabled) refresh(); }, 30000);
    window.addEventListener(CONNECTION_EVENT, connectionChanged);
    return () => { window.clearTimeout(timeoutId); window.clearInterval(interval); window.removeEventListener(CONNECTION_EVENT, connectionChanged); };
  }, [refreshModels, refreshHealth, disabled]);

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
  const thinkingEffortIndex = THINKING_LEVELS.indexOf(thinkingEffort);
  const effortProgress = Math.max(0, thinkingEffortIndex) / (THINKING_LEVELS.length - 1) * 100;
  const activeInstalled = models.some((candidate) => candidate.name === model);

  useEffect(() => {
    if (!disabled && models.length > 0 && !activeInstalled) {
      onModelChange(models[0].name, true);
    }
  }, [activeInstalled, models, onModelChange, disabled]);
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
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white md:hidden"
            aria-label="Toggle sidebar"
          >
            <Menu size={18} />
          </button>

          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
              <span className="truncate">{projectName || "General workspace"}</span>
              <span className={`inline-block h-2 w-2 rounded-full ${healthUnavailable || health?.status === "degraded" ? "bg-rose-400" : health === null ? "bg-amber-400" : "bg-emerald-500"}`} />
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {model ? (
                <>
                  {current.family}
                  {current.version ? <span className="text-slate-400 dark:text-slate-500">:{current.version}</span> : null}
                  {!activeInstalled && models.length > 0 ? (
                    <span className="ml-2 text-amber-300">not installed</span>
                  ) : null}
                  {!activeInstalled && models.length === 0 && !loadingModels ? (
                    <span className="ml-2 text-slate-500">last selected</span>
                  ) : null}
                </>
              ) : loadingModels ? "Connecting to your model…" : llmOnline ? "Choose a local model" : "Model connection unavailable"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen((open) => !open)}
              disabled={disabled}
              className="flex h-10 max-w-[calc(100vw-2rem)] items-center gap-2 rounded-xl border border-[var(--border)] bg-[#1b2026] px-3 text-xs font-medium text-slate-200 shadow-sm transition hover:border-[#e58e74]/70 hover:bg-[#20262e] disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-[22rem]"
              aria-expanded={dropdownOpen}
              aria-haspopup="listbox"
            >
              <Cpu size={14} className="text-[#e58e74]" />
              <span className="min-w-0 truncate sm:max-w-[19rem]" title={model}>
                {model ? `${current.family}${current.version ? `:${current.version}` : ""}` : loadingModels ? "Detecting model…" : llmOnline ? "Select a model" : "Model offline"}
              </span>
              <ChevronDown size={14} className={`transition ${dropdownOpen ? "rotate-180" : ""}`} />
            </button>

            {dropdownOpen ? (
              <div className="absolute right-0 top-full z-50 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-[var(--border)] bg-[#171c22] shadow-2xl shadow-black/35">
                <div className="border-b border-[var(--border)] p-3">
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
                      className="h-9 w-full rounded-lg border border-[var(--border)] bg-[#111418] pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-[#e58e74] focus:outline-none"
                    />
                  </div>
                </div>

                {!llmOnline ? (
                  <div className="p-5 text-sm text-slate-600 dark:text-slate-300">
                    <AlertCircle size={18} className="mb-3 text-rose-500" />
                    Model API is unavailable. Start Atomic Chat’s API, load a model, and refresh.
                  </div>
                ) : models.length === 0 ? (
                  <div className="p-5 text-sm text-slate-600 dark:text-slate-300">
                    <AlertCircle size={18} className="mb-3 text-amber-500" />
                    No models detected. Load your model in Atomic Chat and refresh.
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
                              ? "bg-[#e58e74]/10 text-[#ffd0c1]"
                              : "text-slate-300 hover:bg-slate-800/70"
                          }`}
                          role="option"
                          aria-selected={isActive}
                        >
                          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800 text-slate-400">
                            <Cpu size={15} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold" title={candidate.name}>
                              {name.family}{name.version ? `:${name.version}` : ""}
                            </span>
                            {modelMeta(candidate) ? (
                              <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                                {modelMeta(candidate)}
                              </span>
                            ) : null}
                          </span>
                          {isActive ? <Check size={16} className="text-[#e58e74]" /> : null}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="border-t border-[var(--border)] bg-[#14191f] px-3.5 py-3">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="thinking-effort" className="font-medium text-slate-300">
                      Effort <span className="ml-1 font-semibold capitalize text-[#f0a087]">{thinkingEffort}</span>
                    </label>
                    <span className="text-[10px] text-slate-500">More time, deeper answers</span>
                  </div>
                  <input
                    id="thinking-effort"
                    type="range"
                    min={0}
                    max={THINKING_LEVELS.length - 1}
                    step={1}
                    value={Math.max(thinkingEffortIndex, 0)}
                    onChange={(event) => onThinkingEffortChange(THINKING_LEVELS[Number(event.target.value)])}
                    disabled={disabled}
                    aria-valuetext={thinkingEffort}
                    aria-label="Thinking effort"
                    style={{ "--effort-progress": `${effortProgress}%` } as React.CSSProperties}
                    className="effort-slider mt-3 w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <div className="mt-1 flex justify-between text-[10px] font-medium text-slate-500">
                    <span>Faster</span>
                    <span>Smarter</span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <button type="button" onClick={onOpenConnection} disabled={disabled} aria-label="Open connection assistant"
            className={`flex h-9 shrink-0 items-center gap-2 rounded-full border px-2.5 text-xs font-medium transition hover:brightness-125 disabled:opacity-50 sm:px-3 ${
              health?.status === "ok"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"
                : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200"
            }`}
            title={healthUnavailable ? "The backend health check failed" : health?.database_connected === false ? health.database_detail || "Database unavailable" : health?.ollama_reachable === false ? health.ollama_detail || "Model provider unavailable" : undefined}
          >
            <span className={`h-2 w-2 rounded-full ${healthUnavailable || health?.status === "degraded" ? "bg-rose-500" : health === null ? "bg-amber-400" : "bg-emerald-500"}`} />
            <span className="hidden sm:inline">{healthUnavailable ? "Backend offline" : health === null ? "Connecting" : health.database_connected === false ? "Database issue" : health.ollama_reachable === false ? "Model offline" : "Ready"}</span>
          </button>

        </div>
      </div>
    </header>
  );
}
