"use client";

import { useCallback, useEffect, useState } from "react";
import { UserSettings } from "@/types/chat";

const SETTINGS_STORAGE_KEY = "localgpt:user-settings";

export const DEFAULT_SETTINGS: UserSettings = {
  temperature: 0.4,
  maxTokens: 16384,
  thinkingEffort: "max",
  systemStyle: "balanced",
  webSearch: true,
  searchMode: "auto",
  markdownRich: true,
};

function loadSettings(): UserSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_SETTINGS;
    }

    const parsed = JSON.parse(raw) as Partial<UserSettings>;
    const effortLevels = ["low", "medium", "high", "max"];
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      searchMode: ["auto", "always", "off"].includes(parsed.searchMode ?? "")
        ? parsed.searchMode!
        : parsed.webSearch === false ? "off" : "auto",
      temperature: Number.isFinite(parsed.temperature) ? Number(parsed.temperature) : DEFAULT_SETTINGS.temperature,
      maxTokens: Number.isFinite(parsed.maxTokens) ? Number(parsed.maxTokens) : DEFAULT_SETTINGS.maxTokens,
      thinkingEffort: effortLevels.includes(parsed.thinkingEffort ?? "")
        ? parsed.thinkingEffort!
        : DEFAULT_SETTINGS.thinkingEffort,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useSettings() {
  const [settings, setSettingsState] = useState<UserSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSettingsState(loadSettings());
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  const setSettings = useCallback((nextSettings: UserSettings) => {
    setSettingsState(nextSettings);
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(nextSettings));
  }, []);

  return { settings, setSettings };
}
