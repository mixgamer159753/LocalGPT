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

const CodeWorkspace = dynamic(() => import("@/components/CodeWorkspace"), { ssr: false });

export default function Home() {
  const { settings, setSettings } = useSettings();
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
  } = useChat(settings);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [composerSession, setComposerSession] = useState(0);
  const workspace = useCodeWorkspace();

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
        conversations={conversations}
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
        />

        <ChatInput
          key={`${composerSession}-${conversationId ?? "new"}`}
          onSend={sendMessage}
          onStop={stopGeneration}
          disabled={loading}
          searchMode={settings.searchMode}
          onSearchModeChange={(searchMode) => setSettings({ ...settings, searchMode, webSearch: searchMode !== "off" })}
        />
      </section>

      {workspace.visible && workspace.session && <CodeWorkspace key={workspace.session.id}
        project={workspace.session} originalFiles={workspace.session.originalFiles} saveState={workspace.saveState}
        onClose={workspace.closeWorkspace} onSelectFile={workspace.selectFile}
        onUpdateFile={workspace.updateFile} onReset={workspace.resetFiles} />}

    </main>
  );
}
