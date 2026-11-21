import { Model } from 'mongoose';
import { ChatServiceService } from './chat-service.service';
import { ConversationDocument } from './database/schemas/conversation.schema';
import { MessageDocument } from './database/schemas/message.schema';

jest.mock('apps/api/src/config/env.config', () => ({
  env: { MONGO_READ_PREFERENCE: 'primary' },
}));

describe('saveMessage idempotency', () => {
  const conversationId = '507f1f77bcf86cd799439011';
  const conversation = {
    _id: conversationId,
    participants: [{ userId: 'alice' }, { userId: 'bob' }],
  };
  const payload = {
    conversationId,
    senderId: 'alice',
    text: 'hi',
    clientMessageId: 'client-1',
  };

  const messages = { findOne: jest.fn(), create: jest.fn() };
  const conversations = { findOne: jest.fn(), findByIdAndUpdate: jest.fn() };
  const cacheManager = { del: jest.fn() };
  const service = new ChatServiceService(
    messages as unknown as Model<MessageDocument>,
    conversations as unknown as Model<ConversationDocument>,
    cacheManager as any,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    cacheManager.del.mockResolvedValue(undefined);
    conversations.findOne.mockResolvedValue(conversation);
    conversations.findByIdAndUpdate.mockResolvedValue(undefined);
  });

  it('returns the stored message when the same clientMessageId is retried', async () => {
    const stored = { _id: 'm1' };
    messages.findOne.mockResolvedValueOnce(stored);

    await expect(service.saveMessage(payload)).resolves.toBe(stored);
    expect(messages.create).not.toHaveBeenCalled();
  });

  it('returns the winning message when two sends of the same id race', async () => {
    const stored = { _id: 'm1' };
    messages.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(stored);
    messages.create.mockRejectedValueOnce({ code: 11000 });

    await expect(service.saveMessage(payload)).resolves.toBe(stored);
  });

  it('rethrows other storage errors', async () => {
    messages.findOne.mockResolvedValueOnce(null);
    messages.create.mockRejectedValueOnce(new Error('disk full'));

    await expect(service.saveMessage(payload)).rejects.toThrow('disk full');
  });

  it('does not reveal stored messages to senders outside the conversation', async () => {
    conversations.findOne.mockResolvedValueOnce(null);

    await expect(service.saveMessage(payload)).rejects.toBeDefined();
    expect(messages.findOne).not.toHaveBeenCalled();
  });
});
