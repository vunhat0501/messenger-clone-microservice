'use client';

import React, { useState } from 'react';
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
  UserSummary,
} from '@/app/(protected)/messages/type';

interface ChatSidebarProps {
  user: any;
  conversations: ConversationItem[];
  activeConversation: ConversationItem | null;
  setActiveConversation: (conv: ConversationItem) => void;
  availableUsers: UserSummary[];
  handleStartChatWithUser: (user: UserSummary) => void;
  socketStatus: string;
  selectedGateway: string;
  setSelectedGateway: (gw: string) => void;
}

export function ChatSidebar({
  user,
  conversations,
  activeConversation,
  setActiveConversation,
  availableUsers,
  handleStartChatWithUser,
  socketStatus,
  selectedGateway,
  setSelectedGateway,
}: ChatSidebarProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);

  const getOtherParticipant = (conv: ConversationItem): Participant => {
    if (conv.participants && user) {
      const other = conv.participants.find((p) => p.userId !== user.id);
      if (other) return other;
    }
    return conv.participants?.[0] || { userId: 0, userName: 'Chat' };
  };

  const filteredConversations = conversations.filter((c) => {
    const other = getOtherParticipant(c);
    const title = c.isGroup ? c.groupName : other.userName;
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
              <div className="max-h-60 overflow-y-auto space-y-1">
                {availableUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      handleStartChatWithUser(u);
                      setIsNewChatOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition hover:bg-muted"
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={u.avatarUrl} />
                      <AvatarFallback>
                        {u.userName.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{u.userName}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

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

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredConversations.map((conv) => {
          const other = getOtherParticipant(conv);
          const title = conv.isGroup ? conv.groupName : other.userName;
          const isSelected = activeConversation?._id === conv._id;

          return (
            <button
              key={conv._id}
              onClick={() => setActiveConversation(conv)}
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
                <span className="truncate font-medium text-sm">{title}</span>
                <span className="truncate text-xs">
                  {conv.lastMessageSnippet}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="border-t p-3 bg-muted/40">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-medium">
            <Server className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Gateway:</span>
          </div>
          <div className="flex items-center gap-1">
            <Circle
              className={`h-2 w-2 fill-current ${socketStatus === 'connected' ? 'text-emerald-500' : 'text-amber-500'}`}
            />
            <span className="text-[11px] capitalize">{socketStatus}</span>
          </div>
        </div>
        <div className="mt-2 flex gap-1">
          <button
            onClick={() => setSelectedGateway('http://localhost:80')}
            className="flex-1 rounded px-1.5 py-1 text-[10px] bg-muted"
          >
            Nginx (:80)
          </button>
          <button
            onClick={() => setSelectedGateway('http://localhost:8008')}
            className="flex-1 rounded px-1.5 py-1 text-[10px] bg-muted"
          >
            GW 1
          </button>
          <button
            onClick={() => setSelectedGateway('http://localhost:8009')}
            className="flex-1 rounded px-1.5 py-1 text-[10px] bg-muted"
          >
            GW 2
          </button>
        </div>
      </div>
    </div>
  );
}
