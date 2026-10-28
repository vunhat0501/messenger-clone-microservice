'use client';

import React from 'react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@workspace/ui/components/avatar';
import { Button } from '@workspace/ui/components/button';
import { Input } from '@workspace/ui/components/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@workspace/ui/components/dialog';
import { Plus, Search, MessageSquare, Circle, Server } from 'lucide-react';
import {
  ConversationItem,
  Participant,
  SocketStatus,
  UserSummary,
} from '../type';

interface ChatSidebarProps {
  conversations: ConversationItem[];
  activeConversation: ConversationItem | null;
  onSelectConversation: (conv: ConversationItem) => void;
  availableUsers: UserSummary[];
  onStartChatWithUser: (user: UserSummary) => Promise<void>;
  isNewChatOpen: boolean;
  setIsNewChatOpen: (open: boolean) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  selectedGateway: string;
  onSelectGateway: (gateway: string) => void;
  socketStatus: SocketStatus;
  isDisconnected: boolean;
  onDisconnect: () => void;
  currentUserId?: number;
  currentUserName?: string;
}

export function ChatSidebar({
  conversations,
  activeConversation,
  onSelectConversation,
  availableUsers,
  onStartChatWithUser,
  isNewChatOpen,
  setIsNewChatOpen,
  searchTerm,
  setSearchTerm,
  selectedGateway,
  onSelectGateway,
  socketStatus,
  isDisconnected,
  onDisconnect,
  currentUserId,
  currentUserName,
}: ChatSidebarProps) {
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

  const filteredConversations = conversations.filter((c) => {
    const other = getOtherParticipant(c);
    const title = c.isGroup && c.groupName ? c.groupName : other.userName;
    return title?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div className="flex w-80 flex-col border-r bg-muted/20">
      <div className="flex items-center justify-between border-b p-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-lg">Chats</h2>
        </div>

        <Dialog open={isNewChatOpen} onOpenChange={setIsNewChatOpen}>
          <DialogTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-full"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Start a New Conversation</DialogTitle>
            </DialogHeader>
            <div className="mt-2 space-y-2">
              <p className="text-xs text-muted-foreground">
                Select a user to begin chatting:
              </p>
              <div className="max-h-60 overflow-y-auto space-y-1">
                {availableUsers.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No other users found.
                  </div>
                ) : (
                  availableUsers.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => onStartChatWithUser(u)}
                      className="flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition hover:bg-muted"
                    >
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={u.avatarUrl} />
                        <AvatarFallback>
                          {u.userName.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">
                          {u.userName}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {u.email || `User #${u.id}`}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            className="pl-8 text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredConversations.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No conversations yet. Start one!
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const other = getOtherParticipant(conv);
            const title =
              conv.isGroup && conv.groupName ? conv.groupName : other.userName;
            const isSelected = activeConversation?._id === conv._id;

            return (
              <button
                key={conv._id}
                onClick={() => onSelectConversation(conv)}
                className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition ${
                  isSelected
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'hover:bg-muted text-foreground'
                }`}
              >
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarImage src={other.avatarUrl} />
                  <AvatarFallback
                    className={
                      isSelected ? 'bg-primary-foreground text-primary' : ''
                    }
                  >
                    {title?.substring(0, 2).toUpperCase() || 'CH'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center justify-between">
                    <span className="truncate font-medium text-sm">
                      {title}
                    </span>
                    {conv.lastMessageAt && (
                      <span
                        className={`text-[10px] ${
                          isSelected
                            ? 'text-primary-foreground/70'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {new Date(conv.lastMessageAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                  </div>
                  <span
                    className={`truncate text-xs ${
                      isSelected
                        ? 'text-primary-foreground/80'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {conv.lastMessageSnippet || 'No messages yet'}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Gateway connection demo bar */}
      <div className="border-t p-3 bg-muted/40">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-medium">
            <Server className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Gateway:</span>
          </div>
          <div className="flex items-center gap-1">
            <Circle
              className={`h-2 w-2 fill-current ${
                !isDisconnected && socketStatus === 'connected'
                  ? 'text-emerald-500'
                  : !isDisconnected && socketStatus === 'connecting'
                    ? 'text-amber-500'
                    : 'text-rose-500'
              }`}
            />
            <span className="text-[11px] capitalize">
              {isDisconnected ? 'disconnected' : socketStatus}
            </span>
          </div>
        </div>
        <div className="mt-2 flex gap-1">
          <button
            onClick={() => onSelectGateway('http://localhost:80')}
            className={`flex-1 rounded px-1 py-1 text-[10px] font-medium transition ${
              !isDisconnected &&
              selectedGateway.includes(':80') &&
              !selectedGateway.includes(':800')
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80 text-muted-foreground'
            }`}
          >
            Nginx (:80)
          </button>
          <button
            onClick={() => onSelectGateway('http://localhost:8008')}
            className={`flex-1 rounded px-1 py-1 text-[10px] font-medium transition ${
              !isDisconnected && selectedGateway.includes('8008')
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80 text-muted-foreground'
            }`}
          >
            GW 1 (:8008)
          </button>
          <button
            onClick={() => onSelectGateway('http://localhost:8009')}
            className={`flex-1 rounded px-1 py-1 text-[10px] font-medium transition ${
              !isDisconnected && selectedGateway.includes('8009')
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80 text-muted-foreground'
            }`}
          >
            GW 2 (:8009)
          </button>
          <button
            onClick={onDisconnect}
            className={`flex-1 rounded px-1 py-1 text-[10px] font-medium transition ${
              isDisconnected
                ? 'bg-destructive text-destructive-foreground font-semibold shadow-sm'
                : 'bg-muted hover:bg-muted/80 text-muted-foreground'
            }`}
            title={
              isDisconnected
                ? 'Click to reconnect to gateway'
                : 'Disconnect from WebSocket'
            }
          >
            {isDisconnected ? 'Disconnected' : 'Disconnect'}
          </button>
        </div>
      </div>
    </div>
  );
}
