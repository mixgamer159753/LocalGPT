"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiErrorMessage, fetchProjects, getApiBaseUrl } from "@/lib/api";
import { ProjectSpace } from "@/types/chat";

export function useProjects() {
  const [projects, setProjects] = useState<ProjectSpace[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const requestRef = useRef(0);
  const refresh = useCallback(async (reset = false) => {
    const requestId = ++requestRef.current;
    const target = getApiBaseUrl();
    if (reset) { setProjects([]); setProjectId(null); }
    try {
      const list = await fetchProjects();
      if (requestId !== requestRef.current || target !== getApiBaseUrl()) return;
      setProjects(list);
      setProjectId((id) => list.some((project) => project.id === id) ? id : null);
      setError("");
    } catch (error) { if (requestId === requestRef.current && target === getApiBaseUrl()) setError(apiErrorMessage(error, "Could not load projects. Update and restart the backend.")); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void refresh(), 0); return () => window.clearTimeout(timer); }, [refresh]);
  return { projects, projectId, setProjectId, project: projects.find((project) => project.id === projectId), error, refresh };
}
