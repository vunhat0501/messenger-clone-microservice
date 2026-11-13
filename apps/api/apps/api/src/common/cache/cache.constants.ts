export const CACHE_TTL = {
  USERS_ALL: 60 * 1000,
  USER_DETAIL: 5 * 60 * 1000,
  CONVERSATIONS: 60 * 1000,
  MESSAGES: 60 * 1000,
} as const;

export const CACHE_KEYS = {
  USERS_ALL: 'users:all',
  userById: (id: number | string) => `users:id:${id}`,
  userByProfile: (userName: string) =>
    `users:profile:${userName.trim().toLowerCase()}`,
  userConversations: (userId: number | string) =>
    `chat:conversations:user:${userId}`,
  conversationById: (conversationId: string, userId: number | string) =>
    `chat:conversation:${conversationId}:user:${userId}`,
  conversationMessages: (conversationId: string, limit = 100) =>
    `chat:messages:${conversationId}:limit:${limit}`,
} as const;
