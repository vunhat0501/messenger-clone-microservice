export interface Participant {
  userId: string;
  userName: string;
  avatarUrl?: string;
}

export interface ConversationItem {
  _id: string;
  participants: Participant[];
  isGroup: boolean;
  groupName?: string;
  lastMessageAt?: string;
  lastMessageSnippet?: string;
}

export interface ChatMessage {
  _id: string;
  conversationId: string;
  senderId: string;
  text: string;
  createdAt: string;
  readBy?: string[];
}

export interface UserSummary {
  id: string;
  userName: string;
  email?: string;
  avatarUrl?: string;
}

export type SocketStatus = 'connected' | 'connecting' | 'disconnected';
