'use client';

import React, { useEffect, useState, useRef } from 'react';
import { api, refreshSession } from '@/lib/api';
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
  const [conversationsError, setConversationsError] = useState(false);
  const [messagesError, setMessagesError] = useState(false);
  const [socketStatus, setSocketStatus] = useState<SocketStatus>('connecting');
  const [isDisconnected, setIsDisconnected] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);

  // Gateway switcher for demo purposes (Nginx load balancer default, or direct gateway instances)
  const [selectedGateway, setSelectedGateway] = useState<string>(
    typeof window !== 'undefined'
      ? process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:80'
      : 'http://localhost:80',
  );
  const [activeInstanceId, setActiveInstanceId] = useState<string>('');

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
    setConversationsError(false);
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
      setConversationsError(true);
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
    setMessagesError(false);
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
      setMessages([]);
      setMessagesError(true);
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
    const MAX_AUTH_RETRIES = 3;
    let authRetries = 0;
    let rejectedByAuth = false;
    let authRetryTimer: ReturnType<typeof setTimeout> | undefined;

    const setupSocket = async () => {
      setSocketStatus('connecting');

      const fetchFreshToken = async (): Promise<string> => {
        try {
          const tokenRes = await fetch('/api/auth/token');
          const tokenJson = await tokenRes.json();
          if (tokenJson.token) {
            return tokenJson.token;
          }
          await refreshSession();
          const retryRes = await fetch('/api/auth/token');
          const retryJson = await retryRes.json();
          return retryJson.token || '';
        } catch (e) {
          console.warn('Could not fetch token for WS:', e);
          return '';
        }
      };

      socket = io(selectedGateway, {
        auth: async (cb: (data: { token?: string }) => void) => {
          const freshToken = await fetchFreshToken();
          cb({ token: freshToken });
        },
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

      socket.on(
        'gatewayConnected',
        ({ instanceId }: { instanceId: string }) => {
          authRetries = 0;
          setActiveInstanceId(instanceId);
        },
      );

      socket.on('auth_error', () => {
        rejectedByAuth = true;
      });

      socket.on('disconnect', (reason) => {
        if (
          reason === 'io server disconnect' &&
          rejectedByAuth &&
          authRetries < MAX_AUTH_RETRIES
        ) {
          rejectedByAuth = false;
          authRetries += 1;
          setSocketStatus('connecting');
          authRetryTimer = setTimeout(async () => {
            try {
              await refreshSession();
            } catch {
              setSocketStatus('disconnected');
              return;
            }
            socket.connect();
          }, 1000 * authRetries);
          return;
        }
        setSocketStatus('disconnected');
      });

      socket.on('connect_error', (err) => {
        console.warn('Socket connect_error:', err.message);
        setSocketStatus('disconnected');
      });

      socket.on('onlineUsers', (userIds: string[]) => {
        setOnlineUserIds(Array.isArray(userIds) ? userIds : []);
      });

      socket.on(
        'userStatusChanged',
        ({ userId, status }: { userId: string; status: 'online' | 'offline' }) => {
          setOnlineUserIds((prev) => {
            if (status === 'online') {
              if (prev.includes(userId)) return prev;
              return [...prev, userId];
            } else {
              return prev.filter((id) => id !== userId);
            }
          });
        },
      );

      socket.on('newMessage', (incomingMsg: ChatMessage) => {
        if (
          activeConversationRef.current &&
          incomingMsg.conversationId === activeConversationRef.current._id
        ) {
          setMessages((prev) => {
            if (prev.some((m) => m._id === incomingMsg._id)) return prev;
            const pendingIndex = incomingMsg.clientMessageId
              ? prev.findIndex(
                  (m) =>
                    m.status &&
                    m.clientMessageId === incomingMsg.clientMessageId,
                )
              : -1;
            if (pendingIndex >= 0) {
              const next = [...prev];
              next[pendingIndex] = incomingMsg;
              return next;
            }
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
      clearTimeout(authRetryTimer);
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

  const isPendingFor = (m: ChatMessage, clientMessageId: string) =>
    Boolean(m.status) && m.clientMessageId === clientMessageId;

  const settlePending = (clientMessageId: string, saved: ChatMessage) => {
    setMessages((prev) => {
      if (prev.some((m) => m._id === saved._id)) {
        return prev.filter((m) => !isPendingFor(m, clientMessageId));
      }
      return prev.map((m) => (isPendingFor(m, clientMessageId) ? saved : m));
    });
  };

  const setPendingStatus = (
    clientMessageId: string,
    status: 'sending' | 'failed',
  ) => {
    setMessages((prev) =>
      prev.map((m) =>
        isPendingFor(m, clientMessageId) ? { ...m, status } : m,
      ),
    );
  };

  const deliverMessage = (msg: ChatMessage) => {
    const clientMessageId = msg.clientMessageId as string;

    if (!socketRef.current?.connected) {
      setPendingStatus(clientMessageId, 'failed');
      return;
    }

    socketRef.current.timeout(10000).emit(
      'sendMessage',
      {
        conversationId: msg.conversationId,
        text: msg.text,
        clientMessageId,
      },
      (err: Error | null, saved: ChatMessage & { error?: string }) => {
        if (err || !saved || saved.error || !saved._id) {
          console.error('Failed to send message:', err ?? saved?.error);
          setPendingStatus(clientMessageId, 'failed');
          return;
        }
        settlePending(clientMessageId, saved);
      },
    );
  };

  // Handle sending a message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isDisconnected || socketStatus !== 'connected') {
      console.warn('Cannot send message: socket is disconnected');
      return;
    }
    if (!newMessage.trim() || !activeConversation || !user) return;

    const clientMessageId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const pending: ChatMessage = {
      _id: clientMessageId,
      conversationId: activeConversation._id,
      senderId: user.id,
      text: newMessage.trim(),
      createdAt: new Date().toISOString(),
      clientMessageId,
      status: 'sending',
    };

    setNewMessage('');
    setMessages((prev) => [...prev, pending]);
    deliverMessage(pending);
  };

  const handleRetryMessage = (clientMessageId: string) => {
    const failed = messages.find(
      (m) => m.status === 'failed' && m.clientMessageId === clientMessageId,
    );
    if (!failed) return;
    setPendingStatus(clientMessageId, 'sending');
    deliverMessage(failed);
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
        onlineUserIds={onlineUserIds}
        activeInstanceId={activeInstanceId}
        conversationsError={conversationsError}
        onRetryLoadConversations={loadConversations}
      />

      <ChatArea
        activeConversation={activeConversation}
        messages={messages}
        isLoadingMessages={isLoadingMessages}
        messagesError={messagesError}
        onRetryLoadMessages={() =>
          activeConversation && loadMessages(activeConversation._id)
        }
        onRetryMessage={handleRetryMessage}
        newMessage={newMessage}
        setNewMessage={setNewMessage}
        onSendMessage={handleSendMessage}
        selectedGateway={selectedGateway}
        isDisconnected={isDisconnected}
        socketStatus={socketStatus}
        currentUserId={user?.id}
        currentUserName={user?.name}
        onlineUserIds={onlineUserIds}
        messagesEndRef={messagesEndRef}
      />
    </div>
  );
}
