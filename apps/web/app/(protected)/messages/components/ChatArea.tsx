'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@workspace/ui/components/avatar';
import { Button } from '@workspace/ui/components/button';
import { Input } from '@workspace/ui/components/input';
import {
  MessageGroup,
  Message,
  MessageAvatar,
  MessageContent,
  MessageHeader,
} from '@workspace/ui/components/message';
import { Send, MessageSquare } from 'lucide-react';
import {
  ChatMessage,
  ConversationItem,
  Participant,
} from '@/app/(protected)/messages/type';

interface ChatAreaProps {
  user: any;
  activeConversation: ConversationItem | null;
  messages: ChatMessage[];
  isLoadingMessages: boolean;
  handleSendMessage: (text: string) => Promise<void>;
  selectedGateway: string;
}

export function ChatArea({
  user,
  activeConversation,
  messages,
  isLoadingMessages,
  handleSendMessage,
  selectedGateway,
}: ChatAreaProps) {
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    await handleSendMessage(newMessage);
    setNewMessage('');
  };

  const getOtherParticipant = (conv: ConversationItem): Participant => {
    if (conv.participants && user) {
      const other = conv.participants.find((p) => p.userId !== user.id);
      if (other) return other;
    }
    return conv.participants?.[0] || { userId: 0, userName: 'Chat' };
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

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background">
      <div className="flex h-16 items-center justify-between border-b px-6">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={otherParticipant.avatarUrl} />
            <AvatarFallback>
              {otherParticipant.userName.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <h3 className="font-semibold text-sm">
              {activeConversation.isGroup
                ? activeConversation.groupName
                : otherParticipant.userName}
            </h3>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span>Online via {selectedGateway}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {isLoadingMessages ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading...
          </div>
        ) : (
          <MessageGroup className="space-y-4">
            {messages.map((msg) => {
              const isMe = msg.senderId === user?.id;
              const sender = activeConversation.participants.find(
                (p) => p.userId === msg.senderId,
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
                    </MessageHeader>
                    <div
                      className={`rounded-2xl px-4 py-2.5 text-sm shadow-sm max-w-md ${isMe ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}
                    >
                      <p>{msg.text}</p>
                    </div>
                  </MessageContent>
                </Message>
              );
            })}
            <div ref={messagesEndRef} />
          </MessageGroup>
        )}
      </div>

      <div className="border-t p-4">
        <form onSubmit={onSubmit} className="flex gap-2">
          <Input
            placeholder="Type your message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            className="flex-1 rounded-full px-4"
            autoFocus
          />
          <Button
            type="submit"
            disabled={!newMessage.trim()}
            className="rounded-full px-4"
          >
            <Send className="h-4 w-4 mr-1.5" />
            <span>Send</span>
          </Button>
        </form>
      </div>
    </div>
  );
}
