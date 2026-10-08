export interface Participant {
  userId: number;
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
  senderId: number;
  text: string;
  createdAt: string;
  readBy?: number[];
}

export interface UserSummary {
  id: number;
  userName: string;
  email?: string;
  avatarUrl?: string;
}
