import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Types } from 'mongoose';
import { ChatServiceService } from './chat-service.service';
import { Message } from './database/schemas/message.schema';
import { Conversation } from './database/schemas/conversation.schema';
import {
  CACHE_KEYS,
  CACHE_TTL,
} from 'apps/api/src/common/cache/cache.constants';

describe('ChatServiceService', () => {
  let service: ChatServiceService;

  const mockMessageModel = {
    find: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
  };

  const mockConversationModel = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    updateMany: jest.fn(),
  };

  const mockCacheManager = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatServiceService,
        { provide: getModelToken(Message.name), useValue: mockMessageModel },
        {
          provide: getModelToken(Conversation.name),
          useValue: mockConversationModel,
        },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
      ],
    }).compile();

    service = module.get<ChatServiceService>(ChatServiceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getConversations', () => {
    const userId = '10101010-1010-1010-1010-101010101010';

    it('returns cached conversations on cache hit', async () => {
      const cached = [{ _id: '1', isGroup: false }];
      mockCacheManager.get.mockResolvedValueOnce(cached);

      const res = await service.getConversations(userId);

      expect(res).toEqual(cached);
      expect(mockCacheManager.get).toHaveBeenCalledWith(
        CACHE_KEYS.userConversations(userId),
      );
      expect(mockConversationModel.find).not.toHaveBeenCalled();
    });

    it('queries MongoDB on cache miss and caches result', async () => {
      const dbConversations = [{ _id: '2', isGroup: false }];
      mockCacheManager.get.mockResolvedValueOnce(undefined);
      mockConversationModel.find.mockReturnValueOnce({
        sort: jest.fn().mockReturnThis(),
        read: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValueOnce(dbConversations),
      });

      const res = await service.getConversations(userId);

      expect(res).toEqual(dbConversations);
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        CACHE_KEYS.userConversations(userId),
        dbConversations,
        CACHE_TTL.CONVERSATIONS,
      );
    });
  });

  describe('saveMessage', () => {
    it('saves message and invalidates conversation and participant caches', async () => {
      const convId = new Types.ObjectId().toHexString();
      const u1 = '11111111-1111-1111-1111-111111111111';
      const u2 = '22222222-2222-2222-2222-222222222222';
      mockConversationModel.findOne.mockResolvedValueOnce({
        _id: convId,
        participants: [
          { userId: u1, userName: 'alice' },
          { userId: u2, userName: 'bob' },
        ],
      });
      const createdMsg = { _id: 'msg1', text: 'hello', senderId: u1 };
      mockMessageModel.create.mockResolvedValueOnce(createdMsg);
      mockConversationModel.findByIdAndUpdate.mockResolvedValueOnce({});

      const result = await service.saveMessage({
        conversationId: convId,
        senderId: u1,
        text: 'hello',
      });

      expect(result).toEqual(createdMsg);
      expect(mockCacheManager.del).toHaveBeenCalledWith(
        CACHE_KEYS.userConversations(u1),
      );
      expect(mockCacheManager.del).toHaveBeenCalledWith(
        CACHE_KEYS.userConversations(u2),
      );
      expect(mockCacheManager.del).toHaveBeenCalledWith(
        CACHE_KEYS.conversationMessages(convId, 100),
      );
    });
  });
});
