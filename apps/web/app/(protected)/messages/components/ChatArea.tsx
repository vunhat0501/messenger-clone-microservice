'use client';

import React from 'react';
import {
  MessageGroup,
  Message,
  MessageAvatar,
  MessageContent,
  MessageHeader,
} from '@workspace/ui/components/message';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@workspace/ui/components/avatar';
import { Button } from '@workspace/ui/components/button';
import { Input } from '@workspace/ui/components/input';
import { Send, MessageSquare } from 'lucide-react';
import {
  ChatMessage,
  ConversationItem,
  Participant,
  SocketStatus,
} from '../type';

interface ChatAreaProps {
  activeConversation: ConversationItem | null;
  messages: ChatMessage[];
  isLoadingMessages: boolean;
  newMessage: string;
  setNewMessage: (msg: string) => void;
  onSendMessage: (e?: React.FormEvent) => Promise<void>;
  selectedGateway: string;
  isDisconnected: boolean;
  socketStatus: SocketStatus;
  currentUserId?: number;
  currentUserName?: string;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export function ChatArea({
  activeConversation,
  messages,
  isLoadingMessages,
  newMessage,
  setNewMessage,
  onSendMessage,
  selectedGateway,
  isDisconnected,
  socketStatus,
  currentUserId,
  currentUserName,
  messagesEndRef,
}: ChatAreaProps) {
  const getOtherParticipant = (conv: ConversationItem): Participant => {
    if (conv.participants && conv.participants.length > 0) {
      const other = conv.participants.find((p) => {
        const idMatches =
          currentUserId != null && Number(p.userId) === Number(currentUserId);
        const nameMatches = Boolean(
          currentUserName &&
          p.userName?.trim().toLowerCase() ===
            currentUserName?.trim().toLowerCase(),
        );
        return !idMatches && !nameMatches;
      });
      if (other) return other;

      if (conv.participants.length > 1) {
        const firstIsMe =
          (currentUserId != null &&
            Number(conv.participants[0].userId) === Number(currentUserId)) ||
          Boolean(
            currentUserName &&
            conv.participants[0].userName?.trim().toLowerCase() ===
              currentUserName?.trim().toLowerCase(),
          );
        return firstIsMe ? conv.participants[1] : conv.participants[0];
      }
    }
    return (
      conv.participants?.[0] || {
        userId: 0,
        userName: 'Chat',
        avatarUrl: undefined,
      }
    );
  };

  if (!activeConversation) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-background text-muted-foreground">
        <MessageSquare className="mb-4 h-16 w-16 stroke-1 text-muted-foreground/30" />
        <h3 className="font-semibold text-lg text-foreground">
          No Conversation Selected
        </h3>
        <p className="mt-1 text-sm">
          Choose an existing chat from the left or start a new conversation.
        </p>
      </div>
    );
  }

  const otherParticipant = getOtherParticipant(activeConversation);
  const conversationTitle =
    activeConversation.isGroup && activeConversation.groupName
      ? activeConversation.groupName
      : otherParticipant.userName;

  const isConnected = !isDisconnected && socketStatus === 'connected';

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex h-16 items-center justify-between border-b px-6">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={otherParticipant.avatarUrl} />
            <AvatarFallback>
              {otherParticipant.userName.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <h3 className="font-semibold text-sm">{conversationTitle}</h3>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  isConnected ? 'bg-emerald-500' : 'bg-rose-500'
                }`}
              />
              <span>
                {isDisconnected
                  ? 'Disconnected from WS'
                  : socketStatus === 'connecting'
                    ? 'Connecting to gateway...'
                    : `Online via ${selectedGateway}`}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-md bg-muted px-2 py-1">
            Room: {activeConversation._id.slice(-6)}
          </span>
        </div>
      </div>

      {/* Messages scroll area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {isLoadingMessages ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading messages...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-sm text-muted-foreground">
            <MessageSquare className="mb-2 h-10 w-10 stroke-1 text-muted-foreground/40" />
            <p>No messages yet in this conversation.</p>
            <p className="text-xs">Send a message below to start chatting!</p>
          </div>
        ) : (
          <MessageGroup className="space-y-4">
            {messages.map((msg) => {
              const sender = activeConversation.participants.find(
                (p) => Number(p.userId) === Number(msg.senderId),
              );
              const isMe =
                (currentUserId != null &&
                  Number(msg.senderId) === Number(currentUserId)) ||
                Boolean(
                  currentUserName &&
                  sender?.userName?.trim().toLowerCase() ===
                    currentUserName?.trim().toLowerCase(),
                );
              const senderName = isMe
                ? 'You'
                : sender?.userName || `User ${msg.senderId}`;

              return (
                <Message
                  key={msg._id}
                  align={isMe ? 'end' : 'start'}
                  className="group"
                >
                  {!isMe && (
                    <MessageAvatar>
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={sender?.avatarUrl} />
                        <AvatarFallback>
                          {senderName.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </MessageAvatar>
                  )}

                  <MessageContent>
                    <MessageHeader className="mb-1 text-[11px]">
                      <span>{senderName}</span>
                      <span className="ml-2 text-[10px] text-muted-foreground">
                        {new Date(msg.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </MessageHeader>

                    <div
                      className={`rounded-2xl px-4 py-2.5 text-sm shadow-sm max-w-md ${
                        isMe
                          ? 'bg-primary text-primary-foreground rounded-br-xs'
                          : 'bg-muted text-foreground rounded-bl-xs'
                      }`}
                    >
                      <p className="wrap-break-words leading-relaxed">
                        {msg.text}
                      </p>
                    </div>
                  </MessageContent>
                </Message>
              );
            })}
            <div ref={messagesEndRef} />
          </MessageGroup>
        )}
      </div>

      {/* Input field */}
      <div className="border-t p-4">
        {isDisconnected && (
          <div className="mb-3 flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
              <span>WebSocket is disconnected. Chatting is disabled.</span>
            </div>
            <span className="text-[11px] font-medium opacity-90">
              Select a gateway in the sidebar to reconnect
            </span>
          </div>
        )}
        <form onSubmit={onSendMessage} className="flex gap-2">
          <Input
            placeholder={
              isDisconnected
                ? 'WebSocket disconnected. Connect to a gateway to chat...'
                : socketStatus === 'connecting'
                  ? 'Connecting to gateway...'
                  : 'Type your message...'
            }
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            disabled={!isConnected}
            className="flex-1 rounded-full px-4 disabled:opacity-60 disabled:cursor-not-allowed"
            autoFocus={isConnected}
          />
          <Button
            type="submit"
            disabled={!isConnected || !newMessage.trim()}
            className="rounded-full px-4 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="h-4 w-4 mr-1.5" />
            <span>Send</span>
          </Button>
        </form>
      </div>
    </div>
  );
}
