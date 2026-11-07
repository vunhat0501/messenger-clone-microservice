import { Model } from 'mongoose';
import { ChatServiceService } from './chat-service.service';
import { ConversationDocument } from './database/schemas/conversation.schema';
import { MessageDocument } from './database/schemas/message.schema';

jest.mock('apps/api/src/config/env.config', () => ({
  env: { MONGO_READ_PREFERENCE: 'secondaryPreferred' },
}));

describe('Chat replica reads', () => {
  const query = {
    sort: jest.fn().mockReturnThis(),
    read: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
  };
  const conversations = {
    find: jest.fn(() => query),
    findOne: jest.fn(),
  };
  const messages = { find: jest.fn(() => query) };
  const service = new ChatServiceService(
    messages as unknown as Model<MessageDocument>,
    conversations as unknown as Model<ConversationDocument>,
  );

  beforeEach(() => jest.clearAllMocks());

  it('uses the replica preference for conversation listings', async () => {
    await service.getConversations(1);
    expect(query.read).toHaveBeenCalledWith('secondaryPreferred');
    expect(conversations.find).toHaveBeenCalledWith({
      'participants.userId': 1,
    });
  });

  it('checks membership on the primary before reading message history from a replica', async () => {
    conversations.findOne.mockResolvedValueOnce({
      _id: '507f1f77bcf86cd799439011',
    });
    await service.getMessages('507f1f77bcf86cd799439011', 1);
    expect(conversations.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        'participants.userId': 1,
      }),
    );
    expect(query.read).toHaveBeenCalledWith('secondaryPreferred');
  });

  it('does not read messages if the primary membership check fails', async () => {
    conversations.findOne.mockResolvedValueOnce(null);
    await expect(
      service.getMessages('507f1f77bcf86cd799439011', 1),
    ).rejects.toBeDefined();
    expect(messages.find).not.toHaveBeenCalled();
    expect(query.read).not.toHaveBeenCalled();
  });
});
