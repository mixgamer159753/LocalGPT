"use client";

import { ReactNode, useEffect, useRef } from "react";
import { X } from "lucide-react";
import styles from "./WorkspaceDialog.module.css";

export default function WorkspaceDialog({ title, subtitle, children, onClose }: { title: string; subtitle: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={ref} className={styles.dialog} aria-labelledby="workspace-dialog-title" onCancel={onClose}
    onKeyDown={(event) => { if (event.key === "Escape") event.stopPropagation(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={styles.inner}>
      <header className={styles.header}><div><h2 id="workspace-dialog-title">{title}</h2><p>{subtitle}</p></div><button type="button" onClick={onClose} aria-label="Close dialog"><X size={19} /></button></header>
      <div className={styles.body}>{children}</div>
    </div>
  </dialog>;
}
