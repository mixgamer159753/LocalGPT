"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Check, ChevronDown, Globe2, LoaderCircle, Search, TriangleAlert } from "lucide-react";
import { ResearchInfo } from "@/types/chat";
import { sourceDomain, sourceUrl } from "@/lib/research";
import styles from "./ResearchPanel.module.css";

interface Props {
  research?: ResearchInfo | null;
  query?: string;
  active: boolean;
  stopped: boolean;
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function ResearchPanel({ research, query, active, stopped }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const searching = active && !research;

  useEffect(() => {
    if (!searching) return;
    const start = Date.now();
    const interval = window.setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => window.clearInterval(interval);
  }, [searching]);

  const sources = research?.sources ?? [];
  const title = searching ? "Searching the web" : research?.warning ? "Search needs attention" :
    sources.length ? `Found ${sources.length} sources` : stopped ? "Search stopped" : "Search unavailable";
  const Icon = searching ? LoaderCircle : research?.warning ? TriangleAlert : sources.length ? Globe2 : Search;
  const visibleQuery = research?.query || query;

  return (
    <section className={styles.panel} aria-label="Web research">
      <div className={styles.heading}>
        <span className={styles.icon}><Icon size={15} className={searching ? "animate-spin motion-reduce:animate-none" : ""} aria-hidden="true" /></span>
        <div className={styles.title} role="status" aria-live="polite">{title}</div>
        {research?.cached && <span className={styles.badge}>From cache</span>}
        {sources.length > 0 && (
          <button type="button" className={styles.toggle} onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded} aria-label={expanded ? "Hide source details" : "Show source details"}>
            <span>{expanded ? "Less" : "Sources"}</span>
            <ChevronDown size={14} className={expanded ? styles.rotated : ""} />
          </button>
        )}
      </div>

      {visibleQuery && <p className={styles.query} title={visibleQuery}>{visibleQuery}</p>}

      {searching && (
        <div className={styles.progress}>
          <span className={styles.activeStep}><Search size={12} /> Find sources</span>
          <span className={styles.connector} />
          <span>Write answer</span>
          {elapsed >= 6 && <span className={styles.elapsed}>{elapsed}s</span>}
        </div>
      )}

      {sources.length > 0 && !expanded && (
        <div className={styles.chips}>
          {sources.slice(0, 3).map((source) => (
            <a key={source.id} href={sourceUrl(source.url) ?? undefined} target="_blank" rel="noopener noreferrer" title={source.title}>
              <span className={styles.number}>{source.id}</span>{sourceDomain(source.url)}<ArrowUpRight size={11} />
            </a>
          ))}
          {sources.length > 3 && <button type="button" onClick={() => setExpanded(true)}>+{sources.length - 3} more</button>}
        </div>
      )}

      {expanded && (
        <div className={styles.grid}>
          {sources.map((source) => (
            <a key={source.id} className={styles.card} href={sourceUrl(source.url) ?? undefined} target="_blank" rel="noopener noreferrer">
              <div className={styles.cardMeta}><span className={styles.number}>{source.id}</span><span>{sourceDomain(source.url)}</span><ArrowUpRight size={13} /></div>
              <h3>{source.title}</h3>
              {source.snippet && <p>{source.snippet}</p>}
              {formatDate(source.published_date) && <time dateTime={source.published_date!}>{formatDate(source.published_date)}</time>}
            </a>
          ))}
        </div>
      )}

      {research?.warning && <p className={styles.warning}>{research.warning} The answer will flag anything it could not verify.</p>}
      {active && research && !research.warning && <div className={styles.ready} role="status"><Check size={12} /> Sources ready <span>· Preparing your answer</span></div>}
    </section>
  );
}
