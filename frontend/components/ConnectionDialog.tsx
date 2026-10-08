"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Copy, LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react";
import { apiErrorMessage, defaultApiBaseUrl, fetchDiagnostics, getApiBaseUrl, normalizeBackendUrl, saveBackendUrl } from "@/lib/api";
import { ConnectionDiagnostics } from "@/types/chat";
import WorkspaceDialog from "./WorkspaceDialog";
import styles from "./WorkspaceDialog.module.css";

interface Props { model: string; onModelChange: (model: string) => void; onConnectionApplied: (changed: boolean) => void; onClose: () => void }
function modelLabel(name: string) { return name.slice(name.lastIndexOf("/") + 1); }

export default function ConnectionDialog({ model, onModelChange, onConnectionApplied, onClose }: Props) {
  const [url, setUrl] = useState(getApiBaseUrl);
  const [checkedUrl, setCheckedUrl] = useState("");
  const [diagnostics, setDiagnostics] = useState<ConnectionDiagnostics | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  const check = useCallback(async (candidate: string) => {
    controllerRef.current?.abort();
    const controller = new AbortController(); controllerRef.current = controller;
    setBusy(true); setError(""); setNotice(""); setDiagnostics(null);
    try {
      const normalized = normalizeBackendUrl(candidate);
      if (window.location.protocol === "https:" && normalized.startsWith("http:")) throw new Error("This HTTPS page needs an HTTPS backend address. Use an HTTPS tunnel for FastAPI, such as your ngrok URL.");
      const result = await fetchDiagnostics(normalized, controller.signal);
      if (!controller.signal.aborted) { setDiagnostics(result); setCheckedUrl(normalized); }
    } catch (error) {
      if (!controller.signal.aborted) { setCheckedUrl(""); setError(apiErrorMessage(error, error instanceof Error ? error.message : "Connection check failed.")); }
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void check(getApiBaseUrl()), 0);
    return () => { window.clearTimeout(timer); controllerRef.current?.abort(); };
  }, [check]);

  function apply(candidate: string | null) {
    try {
      const previous = getApiBaseUrl();
      saveBackendUrl(candidate);
      const next = getApiBaseUrl();
      setUrl(next); setNotice("Backend address saved for this browser.");
      onConnectionApplied(previous !== next);
      void check(next);
    } catch (error) { setError(error instanceof Error ? error.message : "Browser storage is unavailable."); }
  }

  const modelOk = !!diagnostics?.models.includes(model);
  const steps = diagnostics ? [
    { title: "Browser → FastAPI", ok: true, detail: `Connected to ${checkedUrl}` },
    { title: "Database", ok: diagnostics.database_connected, detail: diagnostics.database_detail ?? "Chat history, files, projects, and memory are available." },
    { title: diagnostics.provider, ok: diagnostics.provider_reachable, detail: diagnostics.provider_detail ?? diagnostics.chat_url },
    { title: "Loaded model", ok: modelOk, detail: modelOk ? modelLabel(model) : diagnostics.models.length ? "Your selected model is unavailable. Choose one of the loaded models below." : "Load a model in Atomic Chat, then check again." },
    { title: "Web research", ok: diagnostics.search_enabled && (diagnostics.search_provider !== "exa" || diagnostics.exa_configured), detail: !diagnostics.search_enabled ? "Web search is disabled in backend/.env." : diagnostics.search_provider === "exa" ? diagnostics.exa_configured ? "Exa key is configured on the backend. Deep research is available; this check does not spend search credits." : "Set EXA_API_KEY in backend/.env and restart FastAPI." : "Legacy search is configured. Add an Exa key to enable deeper source reading." },
    { title: "Frontend origin", ok: diagnostics.frontend_origin_allowed, detail: diagnostics.frontend_origin_allowed ? "This frontend can call the backend." : `Add ${window.location.origin} to CORS_ORIGINS and restart FastAPI.` },
  ] : [];
  return <WorkspaceDialog title="Connection assistant" subtitle="Check each link between this browser, FastAPI, and your local model." onClose={onClose}>
    <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void check(url); }}>
      <label className={styles.field}>FastAPI backend address<input type="url" required value={url} onChange={(event) => { controllerRef.current?.abort(); setBusy(false); setUrl(event.target.value); setDiagnostics(null); setCheckedUrl(""); setNotice(""); setError(""); }} placeholder="http://127.0.0.1:8000" /><span className={styles.note}>Use the backend origin, without /api or /v1. Atomic Chat’s :1337/v1 address belongs in backend/.env.</span></label>
      <div className={styles.row}><button className={`${styles.button} ${styles.primary}`} type="submit" disabled={busy}>{busy ? <LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" /> : <RefreshCw size={14} />} Check connection</button>
        <button className={styles.button} type="button" disabled={busy} onClick={() => apply(url)}>Use this address</button>
        <button className={styles.button} type="button" disabled={busy} onClick={() => apply(null)}>Reset default</button></div>
      <p className={styles.note}>Current target: {getApiBaseUrl()} · Default: {defaultApiBaseUrl()}</p>
    </form>
    {error && <div role="alert" className={styles.error}><p>{error}</p><p className="mt-2">Start FastAPI with <code>python run.py</code> from the backend folder. For Vercel, keep your HTTPS tunnel running and set <code>CORS_ORIGINS</code> to include <code>{typeof window !== "undefined" ? window.location.origin : "your frontend origin"}</code>. A browser network error can also mean the tunnel or CORS blocked the request.</p></div>}
    {notice && <p role="status" className={styles.success}>{notice}</p>}
    {busy && <p role="status" className={styles.note}>Checking the backend, database, and model list…</p>}
    <div className={styles.list}>{steps.map((step) => <article key={step.title} className={`${styles.card} ${styles.step}`}>
      {step.ok ? <CheckCircle2 size={17} className={styles.stepOk} /> : <TriangleAlert size={17} className={styles.stepBad} />}<div><h4>{step.title}</h4><p>{step.detail}</p></div></article>)}</div>
    {diagnostics && <section className={styles.section}><h3>Available models</h3><p className={styles.note}>The full model ID is kept for API requests; the display hides the publisher prefix.</p>
      {checkedUrl !== getApiBaseUrl() && <p className={styles.note}>Use this backend address before selecting one of its models.</p>}
      <div className={styles.list}>{diagnostics.models.map((name) => <button type="button" key={name} disabled={checkedUrl !== getApiBaseUrl()} className={styles.button} title={name} onClick={() => { onModelChange(name); setNotice(`Selected ${modelLabel(name)}.`); }}>{modelLabel(name)}{model === name && <CheckCircle2 size={14} />}</button>)}</div>
      {!diagnostics.models.length && <p className={styles.note}>No loaded models detected.</p>}
      {diagnostics.default_model && !diagnostics.models.includes(diagnostics.default_model) && <p className={styles.error}>DEFAULT_MODEL does not match a loaded model. Update it in backend/.env, or leave it empty to detect a model automatically.</p>}
      <button type="button" className={styles.button} onClick={async () => { try { await navigator.clipboard.writeText(JSON.stringify({ ...diagnostics, frontend: window.location.origin, backend_url: checkedUrl, selected_model: model }, null, 2)); setNotice("Diagnostics copied. API keys are not included."); } catch { setError("Could not copy diagnostics. Browser clipboard access may be blocked."); } }}><Copy size={13} /> Copy diagnostics</button>
    </section>}
  </WorkspaceDialog>;
}
