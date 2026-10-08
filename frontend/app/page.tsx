"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import ChatWindow from "@/components/ChatWindow";
import ChatInput from "@/components/ChatInput";
import { useChat } from "@/hooks/useChat";
import { useSettings } from "@/hooks/useSettings";
import { ThinkingEffort } from "@/types/chat";
import { useCodeWorkspace } from "@/hooks/useCodeWorkspace";
import { useProjects } from "@/hooks/useProjects";
import { CONNECTION_KEY } from "@/lib/api";

const CodeWorkspace = dynamic(() => import("@/components/CodeWorkspace"), { ssr: false });
const ProjectDialog = dynamic(() => import("@/components/ProjectDialog"), { ssr: false });
const ConnectionDialog = dynamic(() => import("@/components/ConnectionDialog"), { ssr: false });

export default function Home() {
  const { settings, setSettings } = useSettings();
  const spaces = useProjects();
  const {
    messages,
    sendMessage,
    stopGeneration,
    loading,
    newChat,
    model,
    setModel,
    conversations,
    conversationId,
    pinnedIds,
    togglePin,
    openConversation,
    removeConversation,
    renameConversation,
    refreshConversations,
    clearHistory,
  } = useChat(settings, spaces.projectId);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [composerSession, setComposerSession] = useState(0);
  const workspace = useCodeWorkspace();
  const [projectDialog, setProjectDialog] = useState<{ creating: boolean; memoryDraft?: string } | null>(null);
  const [connectionOpen, setConnectionOpen] = useState(false);

  function resetChat() {
    setComposerSession((value) => value + 1);
    workspace.closeWorkspace();
    newChat();
  }

  useEffect(() => {
    // A different tab changing servers must not leave old chat IDs active here.
    const handler = (event: StorageEvent) => { if (event.key === CONNECTION_KEY) window.location.reload(); };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  useEffect(() => {
    if (!sidebarOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sidebarOpen]);

  return (
    <main className="flex h-dvh overflow-hidden bg-background text-foreground">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close conversation menu"
          className="fixed inset-0 z-30 cursor-default bg-slate-950/35 backdrop-blur-[2px] md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNewChat={() => {
          setComposerSession((value) => value + 1);
          workspace.closeWorkspace();
          newChat();
          setSidebarOpen(false);
        }}
        conversations={conversations.filter((conversation) => (conversation.project_id ?? null) === spaces.projectId)}
        projects={spaces.projects} projectId={spaces.projectId} projectError={spaces.error} disabled={loading}
        onProjectChange={(id) => { spaces.setProjectId(id); resetChat(); }}
        onCreateProject={() => setProjectDialog({ creating: true })}
        onManageProject={() => setProjectDialog({ creating: false })}
        activeId={conversationId}
        pinnedIds={pinnedIds}
        onSelect={(id) => {
          setComposerSession((value) => value + 1);
          workspace.closeWorkspace();
          openConversation(id);
          setSidebarOpen(false);
        }}
        onDelete={removeConversation}
        onRename={renameConversation}
        onTogglePin={togglePin}
      />

      <section className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col">
        <Header
          projectName={spaces.project?.name}
          onOpenConnection={() => setConnectionOpen(true)}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          model={model}
          thinkingEffort={settings.thinkingEffort}
          onThinkingEffortChange={(thinkingEffort: ThinkingEffort) => {
            setSettings({ ...settings, thinkingEffort });
          }}
          disabled={loading}
          onModelChange={(nextModel, automatic = false) => {
            const activeConversationHasMessages = conversationId !== null && messages.some((message) => message.id !== -1);
            if (
              !automatic &&
              activeConversationHasMessages &&
              nextModel !== model &&
              !window.confirm("Use this model for future prompts in the current conversation?")
            ) {
              return;
            }
            setModel(nextModel);
          }}
        />

        <ChatWindow
          messages={messages}
          loading={loading}
          markdownRich={settings.markdownRich}
          onSend={sendMessage}
          onOpenWorkspace={workspace.openWorkspace}
          onRemember={(memoryDraft) => setProjectDialog({ creating: false, memoryDraft })}
        />

        <ChatInput
          key={`${composerSession}-${conversationId ?? "new"}`}
          onSend={sendMessage}
          onStop={stopGeneration}
          disabled={loading}
          searchMode={settings.searchMode}
          onSearchModeChange={(searchMode) => setSettings({ ...settings, searchMode, webSearch: searchMode !== "off", researchDepth: searchMode === "off" || searchMode === "auto" ? "standard" : settings.researchDepth })}
          researchDepth={settings.researchDepth}
          onResearchDepthChange={(researchDepth) => setSettings({ ...settings, researchDepth, searchMode: researchDepth === "deep" ? "always" : settings.searchMode, webSearch: true })}
        />
      </section>

      {workspace.visible && workspace.session && <CodeWorkspace key={workspace.session.id}
        project={workspace.session} originalFiles={workspace.session.originalFiles} saveState={workspace.saveState}
        onClose={workspace.closeWorkspace} onSelectFile={workspace.selectFile}
        onUpdateFile={workspace.updateFile} onReset={workspace.resetFiles} />}

      {projectDialog && <ProjectDialog key={`${spaces.projectId ?? "general"}-${projectDialog.creating}-${projectDialog.memoryDraft ? "memory" : "details"}`}
        project={spaces.project} creating={projectDialog.creating} memoryDraft={projectDialog.memoryDraft}
        conversations={conversations} activeConversationId={conversationId} onClose={() => setProjectDialog(null)}
        onSaved={async (project) => { await spaces.refresh(); if (projectDialog.creating) { spaces.setProjectId(project.id); resetChat(); } }}
        onDeleted={async () => { spaces.setProjectId(null); resetChat(); await Promise.all([spaces.refresh(), refreshConversations()]); }}
        onMoved={async () => { resetChat(); await refreshConversations(); }} />}
      {connectionOpen && <ConnectionDialog model={model} onModelChange={setModel} onClose={() => setConnectionOpen(false)}
        onConnectionApplied={(changed) => { if (changed) { spaces.setProjectId(null); setModel(""); resetChat(); clearHistory(); } void spaces.refresh(changed); void refreshConversations(); }} />}

    </main>
  );
}
