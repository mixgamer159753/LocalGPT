"use client";

import { useEffect, useState } from "react";
import { Brain, Folder, Plus, Trash2 } from "lucide-react";
import { apiErrorMessage, deleteProject, fetchMemories, moveConversation, removeMemory, saveMemory, saveProject } from "@/lib/api";
import { Conversation, ProjectInput, ProjectSpace, SavedMemory } from "@/types/chat";
import WorkspaceDialog from "./WorkspaceDialog";
import styles from "./WorkspaceDialog.module.css";

interface Props {
  project?: ProjectSpace;
  creating: boolean;
  conversations: Conversation[];
  activeConversationId: number | null;
  memoryDraft?: string;
  onSaved: (project: ProjectSpace) => Promise<void>;
  onDeleted: () => Promise<void>;
  onMoved: () => Promise<void>;
  onClose: () => void;
}

const EMPTY: ProjectInput = { name: "", description: "", instructions: "", memory_enabled: true };

export default function ProjectDialog({ project, creating, conversations, activeConversationId, memoryDraft, onSaved, onDeleted, onMoved, onClose }: Props) {
  const [form, setForm] = useState<ProjectInput>(project ?? EMPTY);
  const [memories, setMemories] = useState<SavedMemory[]>([]);
  const [memoryKey, setMemoryKey] = useState(memoryDraft ? "Note" : "");
  const [memoryValue, setMemoryValue] = useState(memoryDraft?.slice(0, 2000) ?? "");
  const [editingMemory, setEditingMemory] = useState<number | null>(null);
  const [moveId, setMoveId] = useState(String(activeConversationId ?? ""));
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!creating);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const projectId = project?.id ?? null;

  useEffect(() => {
    if (creating) return;
    let active = true;
    void fetchMemories(projectId).then((list) => { if (active) setMemories(list); })
      .catch((error) => { if (active) setError(apiErrorMessage(error, "Could not load memories.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId, creating]);

  async function act(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try { await action(); }
    catch (error) { setError(apiErrorMessage(error, "Could not save this change. Please try again.")); }
    finally { setBusy(false); }
  }

  const moveOptions = conversations.filter((chat) => (chat.project_id ?? null) !== projectId);
  const selectedMove = moveOptions.find((chat) => chat.id === Number(moveId));
  return <WorkspaceDialog title={creating ? "Create a project" : project?.name ?? "General workspace"}
    subtitle={creating ? "Keep related chats, instructions, and useful facts together." : "Control the context your model uses in this space."} onClose={onClose}>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {notice && <p role="status" className={styles.success}>{notice}</p>}
    {(creating || project) && !memoryDraft && <section className={styles.section}>
      <h3 className={styles.row}><Folder size={16} /> Project details</h3>
      <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void act(async () => {
        const saved = await saveProject({ name: form.name.trim(), description: form.description.trim(), instructions: form.instructions.trim(), memory_enabled: form.memory_enabled }, project?.id);
        await onSaved(saved); setNotice("Project saved. Future replies will use these instructions."); if (creating) onClose();
      }); }}>
        <label className={styles.field}>Name<input value={form.name} required maxLength={80} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Website redesign" /></label>
        <label className={styles.field}>Description<input value={form.description} maxLength={500} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="What are you working toward?" /></label>
        <label className={styles.field}>Instructions<textarea value={form.instructions} maxLength={4000} rows={4} onChange={(event) => setForm({ ...form, instructions: event.target.value })} placeholder="For example: use TypeScript, explain changes clearly, and keep the interface accessible." /><span className={styles.note}>Applied to every chat in this project. {form.instructions.length}/4,000 characters.</span></label>
        <label className={styles.check}><input type="checkbox" checked={form.memory_enabled} onChange={(event) => setForm({ ...form, memory_enabled: event.target.checked })} /> Use saved project memories in answers</label>
        <div className={styles.row}><button disabled={busy || !form.name.trim()} className={`${styles.button} ${styles.primary}`} type="submit">{creating ? "Create project" : "Save project"}</button>
          {project && <button className={`${styles.button} ${styles.danger}`} disabled={busy} type="button" onClick={() => {
            if (window.confirm(`Remove “${project.name}” and its memories? Its chats will move to General.`)) void act(async () => { await deleteProject(project.id); await onDeleted(); onClose(); });
          }}><Trash2 size={13} /> Remove project</button>}</div>
      </form>
    </section>}

    {!creating && <section className={styles.section}>
      <h3 className={styles.row}><Brain size={16} /> Useful memory <span className={styles.note}>{memories.length}/30</span></h3>
      <p className={styles.note}>{project ? "These facts belong only to this project. Other projects and General do not use them." : "These facts apply to chats in General. Project chats use their own memories."} Save preferences, decisions, or facts you want to reuse.</p>
      {memoryDraft && <p className={styles.note}>Review and shorten this note before saving. Only the first 2,000 characters are included.</p>}
      {project?.memory_enabled === false && <p className={styles.error}>Project memory is paused. Saved facts stay here; answers will use them after you enable memory.</p>}
      {loading ? <p className={styles.note} role="status">Loading memories…</p> : <div className={styles.list}>
        {memories.map((memory) => <article key={memory.id} className={styles.card}><h4>{memory.key}</h4><p>{memory.value}</p><div className={styles.row}>
          <button type="button" className={styles.button} disabled={busy} onClick={() => { setEditingMemory(memory.id); setMemoryKey(memory.key); setMemoryValue(memory.value.slice(0, 2000)); }}>Edit</button>
          <button type="button" className={`${styles.button} ${styles.danger}`} disabled={busy} onClick={() => {
            if (window.confirm(`Forget “${memory.key}”?`)) void act(async () => { await removeMemory(projectId, memory.id); setMemories((list) => list.filter((item) => item.id !== memory.id)); if (editingMemory === memory.id) { setEditingMemory(null); setMemoryKey(""); setMemoryValue(""); } setNotice("Memory removed."); });
          }}>Forget</button></div></article>)}
        {!memories.length && <p className={styles.note}>No memories saved yet. You decide what is remembered.</p>}
      </div>}
      <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void act(async () => {
        await saveMemory(projectId, memoryKey.trim(), memoryValue.trim());
        setMemories(await fetchMemories(projectId)); setEditingMemory(null); setMemoryKey(""); setMemoryValue(""); setNotice("Memory saved. It will be available to future replies in this space.");
      }); }}>
        <label className={styles.field}>Memory label<input required maxLength={80} value={memoryKey} readOnly={editingMemory !== null} onChange={(event) => setMemoryKey(event.target.value)} placeholder="Preferred stack" /></label>
        <label className={styles.field}>What should be remembered?<textarea required rows={3} maxLength={2000} value={memoryValue} onChange={(event) => setMemoryValue(event.target.value)} placeholder="I use Next.js, FastAPI, and Atomic Chat." /><span>{memoryValue.length}/2,000 characters</span></label>
        <div className={styles.row}><button disabled={busy || loading || !memoryKey.trim() || !memoryValue.trim()} className={`${styles.button} ${styles.primary}`} type="submit"><Plus size={13} /> {editingMemory ? "Update memory" : "Save memory"}</button>
          {editingMemory && <button type="button" className={styles.button} onClick={() => { setEditingMemory(null); setMemoryKey(""); setMemoryValue(""); }}>Cancel edit</button>}</div>
        <p className={styles.note}>Saving an existing label updates that memory. Answers use up to 6,000 characters of saved facts, ordered by label. Memories and instructions stay in your backend database and are sent to your selected model, not to web search.</p>
      </form>
    </section>}

    {!creating && !memoryDraft && <section className={styles.section}><h3>Organize chats</h3><p className={styles.note}>Move a chat into {project?.name ?? "General"}. Its future replies will use this space’s context.</p>
      <label className={styles.field}>Conversation<select value={selectedMove ? moveId : ""} onChange={(event) => setMoveId(event.target.value)} disabled={busy}><option value="">Choose a chat from another space</option>{moveOptions.map((chat) => <option key={chat.id} value={chat.id}>{chat.title}</option>)}</select></label>
      <button type="button" disabled={busy || !selectedMove} className={`${styles.button} mt-3`} onClick={() => void act(async () => { await moveConversation(Number(moveId), projectId); await onMoved(); setMoveId(""); setNotice("Chat moved. Open it from this project’s history."); })}>Move chat here</button>
    </section>}
  </WorkspaceDialog>;
}
