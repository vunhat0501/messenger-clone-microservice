import type { Metadata } from 'next';
import { ChatContainer } from '@/app/(protected)/messages/components/ChatContainer';
import React from 'react';

export const metadata: Metadata = {
  title: 'Messages',
};

export default function MessagesPage() {
  return (
    <div className="flex h-[calc(100vh-6rem)] w-full gap-4 overflow-hidden rounded-xl border bg-background shadow-sm">
      <ChatContainer />
    </div>
  );
}
