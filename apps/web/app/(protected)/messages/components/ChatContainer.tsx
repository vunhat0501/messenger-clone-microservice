'use client';

import React, { useEffect, useState, useRef } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import { io, Socket } from 'socket.io-client';
import {
  ChatMessage,
  ConversationItem,
  UserSummary,
} from '@/app/(protected)/messages/type';
import { ChatSidebar } from '@/app/(protected)/messages/components/ChatSidebar';
import { ChatArea } from '@/app/(protected)/messages/components/ChatArea';

export function ChatContainer() {
  const { user } = useAuthStore();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConversation, setActiveConversation] =
    useState<ConversationItem | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [availableUsers, setAvailableUsers] = useState<UserSummary[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [socketStatus, setSocketStatus] = useState<
    'connected' | 'connecting' | 'disconnected'
  >('connecting');

  const [selectedGateway, setSelectedGateway] = useState<string>(
    typeof window !== 'undefined'
      ? process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:80'
      : 'http://localhost:80',
  );

  const socketRef = useRef<Socket | null>(null);

  const loadConversations = async () => {
    try {
      const res = await api.get('/chat/conversations');
      const data = res.data?.data || res.data || [];
      if (Array.isArray(data)) {
        setConversations(data);
        if (data.length > 0 && !activeConversation) {
          setActiveConversation(data[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  };

  const loadAvailableUsers = async () => {
    try {
      const res = await api.get('/users');
      const data = res.data?.data || res.data || [];
      if (Array.isArray(data)) {
        setAvailableUsers(data.filter((u: UserSummary) => u.id !== user?.id));
      }
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  };

  const loadMessages = async (conversationId: string) => {
    setIsLoadingMessages(true);
    try {
      const res = await api.get(
        `/chat/conversations/${conversationId}/messages`,
      );
      const data = res.data?.data || res.data || [];
      if (Array.isArray(data)) {
        setMessages(data);
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    let socket: Socket;

    const setupSocket = async () => {
      let token = '';
      try {
        const tokenRes = await fetch('/api/auth/token');
        const tokenJson = await tokenRes.json();
        token = tokenJson.token || '';
      } catch (e) {
        console.warn('Could not fetch token for WS:', e);
      }

      socket = io(selectedGateway, {
        auth: { token },
        withCredentials: true,
        transports: ['websocket'],
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        setSocketStatus('connected');
        if (activeConversation) {
          socket.emit('joinConversation', {
            conversationId: activeConversation._id,
          });
        }
      });

      socket.on('disconnect', () => setSocketStatus('disconnected'));
      socket.on('connect_error', () => setSocketStatus('disconnected'));

      socket.on('newMessage', (incomingMsg: ChatMessage) => {
        if (
          activeConversation &&
          incomingMsg.conversationId === activeConversation._id
        ) {
          setMessages((prev) =>
            prev.some((m) => m._id === incomingMsg._id)
              ? prev
              : [...prev, incomingMsg],
          );
        }
        setConversations((prev) =>
          prev.map((c) =>
            c._id === incomingMsg.conversationId
              ? {
                  ...c,
                  lastMessageSnippet: incomingMsg.text,
                  lastMessageAt: incomingMsg.createdAt,
                }
              : c,
          ),
        );
      });

      socket.on('conversationUpdated', (update: any) => {
        setConversations((prev) =>
          prev.map((c) =>
            c._id === update.conversationId
              ? {
                  ...c,
                  lastMessageSnippet: update.lastMessageSnippet,
                  lastMessageAt: update.lastMessageAt,
                }
              : c,
          ),
        );
      });
    };

    setupSocket();
    return () => {
      if (socket) socket.disconnect();
    };
  }, [user, selectedGateway, activeConversation]);

  useEffect(() => {
    if (activeConversation) {
      loadMessages(activeConversation._id);
      if (socketRef.current?.connected) {
        socketRef.current.emit('joinConversation', {
          conversationId: activeConversation._id,
        });
      }
    }
  }, [activeConversation?._id]);

  useEffect(() => {
    loadConversations();
    loadAvailableUsers();
  }, [user]);

  const handleSendMessage = async (text: string) => {
    if (!activeConversation || !user) return;
    try {
      const res = await api.post(
        `/chat/conversations/${activeConversation._id}/messages`,
        { text },
      );
      const savedMsg = res.data?.data || res.data;
      if (savedMsg && savedMsg._id) {
        setMessages((prev) =>
          prev.some((m) => m._id === savedMsg._id) ? prev : [...prev, savedMsg],
        );
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  const handleStartChatWithUser = async (targetUser: UserSummary) => {
    try {
      const res = await api.post('/chat/conversations', {
        targetUserId: targetUser.id,
      });
      const conv = res.data?.data || res.data;
      if (conv) {
        await loadConversations();
        setActiveConversation(conv);
      }
    } catch (err) {
      console.error('Failed to create conversation:', err);
    }
  };

  return (
    <>
      <ChatSidebar
        user={user}
        conversations={conversations}
        activeConversation={activeConversation}
        setActiveConversation={setActiveConversation}
        availableUsers={availableUsers}
        handleStartChatWithUser={handleStartChatWithUser}
        socketStatus={socketStatus}
        selectedGateway={selectedGateway}
        setSelectedGateway={setSelectedGateway}
      />
      <ChatArea
        user={user}
        activeConversation={activeConversation}
        messages={messages}
        isLoadingMessages={isLoadingMessages}
        handleSendMessage={handleSendMessage}
        selectedGateway={selectedGateway}
      />
    </>
  );
}
