import React from 'react';
import { ChatContainer } from './components/ChatContainer';

export const metadata = {
  title: 'Messages | Social App',
  description: 'Real-time chatting with load balanced gateways and WebSocket',
};

export default function MessagesPage() {
  return <ChatContainer />;
}
