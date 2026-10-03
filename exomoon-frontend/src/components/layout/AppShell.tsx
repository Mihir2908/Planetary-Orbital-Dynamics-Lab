'use client';
import React, { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { motion } from 'framer-motion';
import { NoiseBackground } from '@/components/ui/noise-background';
import { cn } from '@/lib/utils';

interface AppShellProps {
  main: React.ReactNode;
  chat: React.ReactNode;
}

export function AppShell({ main, chat }: AppShellProps) {
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-950 text-gray-100 font-sans">
      {/* Main content area — full width */}
      <main className="flex-1 min-w-0 overflow-hidden">
        {main}
      </main>

      {/* Chat drawer — framer-motion slide from right; always mounted to preserve chat state */}
      <motion.div
        initial={false}
        animate={{ x: chatOpen ? 0 : '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 280, mass: 0.8 }}
        className="fixed top-0 right-0 h-full w-96 border-l border-gray-800 shadow-2xl z-50 flex flex-col bg-gray-900"
      >
        <NoiseBackground className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {chat}
        </NoiseBackground>
      </motion.div>

      {/* Chat toggle FAB */}
      <button
        id="tutorial-chat-fab"
        onClick={() => setChatOpen(o => !o)}
        className={cn(
          'fixed bottom-[410px] right-4 z-50 w-12 h-12 rounded-full shadow-lg',
          'flex items-center justify-center transition-colors',
          chatOpen
            ? 'bg-gray-700 hover:bg-gray-600'
            : 'bg-blue-600 hover:bg-blue-500'
        )}
        title="Toggle chat"
      >
        <MessageSquare size={20} />
      </button>
    </div>
  );
}
