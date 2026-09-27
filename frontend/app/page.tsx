"use client";

import { useState } from "react";
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

  return (
    <main className="flex h-dvh overflow-hidden bg-background text-foreground">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/40 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar
        open={sidebarOpen}
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

      <section className="relative z-10 flex min-w-0 flex-1 flex-col">
        <Header
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          model={model}
          disabled={loading}
          onOpenSettings={() => setSettingsOpen(true)}
          onModelChange={(nextModel) => {
            const activeConversationHasMessages = conversationId !== null && messages.some((message) => message.id !== -1);
            if (
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
