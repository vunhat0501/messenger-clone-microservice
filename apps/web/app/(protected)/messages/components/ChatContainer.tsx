'use client';

import React, { useEffect, useState, useRef } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import { io, Socket } from 'socket.io-client';
import {
  ChatMessage,
  ConversationItem,
  SocketStatus,
  UserSummary,
} from '../type';
import { ChatSidebar } from './ChatSidebar';
import { ChatArea } from './ChatArea';

export function ChatContainer() {
  const { user } = useAuthStore();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConversation, setActiveConversation] =
    useState<ConversationItem | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [availableUsers, setAvailableUsers] = useState<UserSummary[]>([]);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [socketStatus, setSocketStatus] = useState<SocketStatus>('connecting');
  const [isDisconnected, setIsDisconnected] = useState(false);

  // Gateway switcher for demo purposes (Nginx load balancer default, or direct gateway instances)
  const [selectedGateway, setSelectedGateway] = useState<string>(
    typeof window !== 'undefined'
      ? process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:80'
      : 'http://localhost:80',
  );

  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeConversationRef = useRef<ConversationItem | null>(null);

  useEffect(() => {
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);

  // Auto scroll to latest message
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load conversations
  const loadConversations = async () => {
    try {
      const res = await api.get('/chat/conversations');
      const data = res.data?.data || res.data || [];
      if (Array.isArray(data)) {
        setConversations(data);
        if (data.length > 0 && !activeConversationRef.current) {
          setActiveConversation(data[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  };

  // Load available users for starting chat
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

  // Load messages for active conversation
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

  // Initialize Socket.IO connection
  useEffect(() => {
    if (!user || isDisconnected) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setSocketStatus('disconnected');
      return;
    }

    let socket: Socket;

    const setupSocket = async () => {
      setSocketStatus('connecting');
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
        if (activeConversationRef.current) {
          socket.emit('joinConversation', {
            conversationId: activeConversationRef.current._id,
          });
        }
      });

      socket.on('disconnect', () => {
        setSocketStatus('disconnected');
      });

      socket.on('connect_error', () => {
        setSocketStatus('disconnected');
      });

      socket.on('newMessage', (incomingMsg: ChatMessage) => {
        if (
          activeConversationRef.current &&
          incomingMsg.conversationId === activeConversationRef.current._id
        ) {
          setMessages((prev) => {
            if (prev.some((m) => m._id === incomingMsg._id)) return prev;
            return [...prev, incomingMsg];
          });
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
      if (socket) {
        socket.disconnect();
      }
    };
  }, [user, selectedGateway, isDisconnected]);

  // When active conversation changes, join room & fetch history
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

  // Handle sending a message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isDisconnected || socketStatus !== 'connected') {
      console.warn('Cannot send message: socket is disconnected');
      return;
    }
    if (!newMessage.trim() || !activeConversation || !user) return;

    const text = newMessage.trim();
    setNewMessage('');

    if (socketRef.current?.connected) {
      socketRef.current.emit(
        'sendMessage',
        {
          conversationId: activeConversation._id,
          text,
          senderId: user.id,
        },
        (savedMsg: ChatMessage) => {
          if (savedMsg && savedMsg._id) {
            setMessages((prev) => {
              if (prev.some((m) => m._id === savedMsg._id)) return prev;
              return [...prev, savedMsg];
            });
          }
        },
      );
    } else {
      try {
        const res = await api.post(
          `/chat/conversations/${activeConversation._id}/messages`,
          { text },
        );
        const savedMsg = res.data?.data || res.data;

        if (savedMsg && savedMsg._id) {
          setMessages((prev) => {
            if (prev.some((m) => m._id === savedMsg._id)) return prev;
            return [...prev, savedMsg];
          });
        }
      } catch (err) {
        console.error('Failed to send message:', err);
      }
    }
  };

  // Start new conversation with a selected user
  const handleStartChatWithUser = async (targetUser: UserSummary) => {
    try {
      const res = await api.post('/chat/conversations', {
        targetUserId: targetUser.id,
      });
      const conv = res.data?.data || res.data;
      if (conv) {
        setIsNewChatOpen(false);
        await loadConversations();
        setActiveConversation(conv);
      }
    } catch (err) {
      console.error('Failed to create conversation:', err);
    }
  };

  const handleDisconnect = () => {
    setIsDisconnected((prev) => {
      if (!prev) {
        if (socketRef.current) {
          socketRef.current.disconnect();
        }
        setSocketStatus('disconnected');
        return true;
      }
      return false;
    });
  };

  const handleSelectGateway = (gateway: string) => {
    setSelectedGateway(gateway);
    setIsDisconnected(false);
  };

  return (
    <div className="flex h-[calc(100vh-6rem)] w-full gap-4 overflow-hidden rounded-xl border bg-background shadow-sm">
      <ChatSidebar
        conversations={conversations}
        activeConversation={activeConversation}
        onSelectConversation={setActiveConversation}
        availableUsers={availableUsers}
        onStartChatWithUser={handleStartChatWithUser}
        isNewChatOpen={isNewChatOpen}
        setIsNewChatOpen={setIsNewChatOpen}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        selectedGateway={selectedGateway}
        onSelectGateway={handleSelectGateway}
        socketStatus={socketStatus}
        isDisconnected={isDisconnected}
        onDisconnect={handleDisconnect}
        currentUserId={user?.id}
        currentUserName={user?.name}
      />

      <ChatArea
        activeConversation={activeConversation}
        messages={messages}
        isLoadingMessages={isLoadingMessages}
        newMessage={newMessage}
        setNewMessage={setNewMessage}
        onSendMessage={handleSendMessage}
        selectedGateway={selectedGateway}
        isDisconnected={isDisconnected}
        socketStatus={socketStatus}
        currentUserId={user?.id}
        currentUserName={user?.name}
        messagesEndRef={messagesEndRef}
      />
    </div>
  );
}
