"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import ChatWindow from "@/components/ChatWindow";
import ChatInput from "@/components/ChatInput";
import SettingsModal from "@/components/SettingsModal";
import { useChat } from "@/hooks/useChat";
import { useSettings } from "@/hooks/useSettings";

export default function Home() {
  const { settings, setSettings, resetSettings } = useSettings();
  const {
    messages,
    sendMessage,
    continueMessage,
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
  const [settingsOpen, setSettingsOpen] = useState(false);

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
          newChat();
          setSidebarOpen(false);
        }}
        conversations={conversations}
        activeId={conversationId}
        pinnedIds={pinnedIds}
        onSelect={(id) => {
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
          disabled={loading}
          onOpenSettings={() => setSettingsOpen(true)}
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
          onContinue={continueMessage}
          onSend={sendMessage}
        />

        <ChatInput
          onSend={sendMessage}
          onStop={stopGeneration}
          disabled={loading}
          model={model}
        />
      </section>

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        onChange={setSettings}
        onReset={resetSettings}
        onClose={() => setSettingsOpen(false)}
      />
    </main>
  );
}
