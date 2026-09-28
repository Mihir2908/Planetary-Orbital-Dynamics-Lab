'use client';
import React, { useEffect, useRef, useState } from 'react';
import { useSimulationStore } from '@/hooks/useSimulationStore';
import { useChatStream } from '@/hooks/useChatStream';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';

export function ChatPanel() {
  const { chatMessages, clearSession } = useSimulationStore();
  const { sendMessage } = useChatStream();
  const bottomRef = useRef<HTMLDivElement>(null);
  const isStreaming = chatMessages.some(m => m.streaming);
  const [agentInfoOpen, setAgentInfoOpen] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* Header */}
      <div className="flex items-center px-4 py-3 border-b border-gray-800 shrink-0">
        <h2 className="text-xs font-semibold text-gray-400 tracking-widest uppercase">Agent Chat</h2>
        <button
          onClick={() => setAgentInfoOpen(true)}
          title="About the AI agent"
          className="ml-2 w-5 h-5 flex items-center justify-center rounded-full text-gray-600 hover:text-blue-400 hover:bg-blue-900/20 transition-colors text-[11px] border border-gray-700/50 shrink-0"
        >
          ℹ
        </button>
        <button
          onClick={clearSession}
          disabled={isStreaming}
          title="Start a new session — clears chat history and cached simulation data"
          className="ml-auto mr-2 px-2 py-0.5 rounded text-[10px] font-medium text-gray-500
                     border border-gray-700 hover:border-gray-500 hover:text-gray-300
                     disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          New Session
        </button>
        <div className={`w-2 h-2 rounded-full ${isStreaming ? 'bg-blue-400 animate-pulse' : 'bg-gray-700'}`} />
      </div>

      {/* Agent info modal */}
      {agentInfoOpen && (
        <>
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={() => setAgentInfoOpen(false)} />
          <div className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 bg-gray-900 border border-gray-700/60 rounded-xl shadow-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white">AI Agent Capabilities</span>
              <button onClick={() => setAgentInfoOpen(false)} className="text-gray-500 hover:text-white text-base leading-none">✕</button>
            </div>
            <div className="space-y-2 text-xs text-gray-400 leading-relaxed">
              <p>The agent is powered by Claude (Anthropic) with extended reasoning. It can:</p>
              <ul className="space-y-1 pl-3 list-disc">
                <li><span className="text-blue-300">Run simulations</span> — describe a system in natural language and it will configure and launch a three-body simulation on your behalf.</li>
                <li><span className="text-blue-300">Fetch exoplanet data</span> — look up any confirmed exoplanet from the NASA Exoplanet Archive and auto-fill parameters.</li>
                <li><span className="text-blue-300">Analyse stability</span> — query moon escape time, maximum separation, habitability metrics from cached simulation results without re-running.</li>
                <li><span className="text-blue-300">Trigger ML previews</span> — run the full 50×50 ML stability grid or query individual grid cells.</li>
              </ul>
              <p className="text-gray-500 text-[10px]">Responses stream token-by-token. Complex queries with extended thinking may take 30–90 seconds.</p>
            </div>
          </div>
        </>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {chatMessages.length === 0 && (
          <div className="mt-4 space-y-3">
            <p className="text-center text-gray-500 text-[11px] px-2">
              Ask me anything about the simulation, or try one of these:
            </p>
            {([
              { text: "Is the moon in the current configuration stable?",         note: "Stability analysis" },
              { text: "Run an ML stability grid to find viable moon configurations", note: "ML Layer 1" },
              { text: "Fetch parameters for Kepler-452b and set up the system",   note: "NASA archive" },
              { text: "Show a trajectory preview of stable and habitable moon orbits", note: "ML Layer 2" },
              { text: "What does the Hill radius tell us about moon stability?",   note: "Explainer" },
              { text: "What can I do with this tool?",                             note: "Overview" },
            ] as const).map(({ text, note }) => (
              <button
                key={text}
                onClick={() => sendMessage(text)}
                className="w-full text-left px-3 py-2 rounded-lg bg-gray-800/60 border border-gray-700/50
                           text-gray-400 text-[11px] hover:border-violet-600/50 hover:text-gray-200
                           hover:bg-gray-800 transition-colors group"
              >
                <span>{text}</span>
                <span className="ml-1.5 text-gray-600 group-hover:text-gray-500 text-[10px]">— {note}</span>
              </button>
            ))}
          </div>
        )}
        {chatMessages.map(msg => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <ChatInput onSend={sendMessage} disabled={isStreaming} />
    </div>
  );
}
