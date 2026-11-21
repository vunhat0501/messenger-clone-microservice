import { Test, TestingModule } from '@nestjs/testing';
import { GatewayUsersController } from './users-gateway.controller';
import { ForbiddenException } from '@nestjs/common';
import { AuthenticatedUser, Role } from '@workspace/types';
import { of } from 'rxjs';

describe('GatewayUsersController', () => {
  let controller: GatewayUsersController;
  const mockAuthClient = {
    send: jest.fn().mockImplementation((pattern, payload) => of({ success: true, pattern, payload })),
  };

  const normalUser: AuthenticatedUser = {
    id: '123',
    name: 'Alice',
    email: 'alice@example.com',
    role: Role.USER,
  };

  const adminUser: AuthenticatedUser = {
    id: '999',
    name: 'Admin',
    email: 'admin@example.com',
    role: Role.ADMIN,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GatewayUsersController],
      providers: [
        {
          provide: 'AUTH_SERVICE',
          useValue: mockAuthClient,
        },
      ],
    }).compile();

    controller = module.get<GatewayUsersController>(GatewayUsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('update', () => {
    it('allows a user to update their own account', () => {
      expect(() => controller.update('123', { bio: 'hello' } as any, normalUser)).not.toThrow();
      expect(mockAuthClient.send).toHaveBeenCalledWith('user.update', {
        id: '123',
        updateUserDto: { bio: 'hello' },
      });
    });

    it('rejects a user attempting to update another account with 403', () => {
      expect(() => controller.update('456', { bio: 'hacked' } as any, normalUser)).toThrow(
        ForbiddenException,
      );
      expect(mockAuthClient.send).not.toHaveBeenCalled();
    });

    it('allows an admin to update any account', () => {
      expect(() => controller.update('456', { bio: 'admin update' } as any, adminUser)).not.toThrow();
      expect(mockAuthClient.send).toHaveBeenCalledWith('user.update', {
        id: '456',
        updateUserDto: { bio: 'admin update' },
      });
    });
  });

  describe('softDeleteUser', () => {
    it('allows a user to delete their own account', () => {
      expect(() => controller.softDeleteUser('123', normalUser)).not.toThrow();
      expect(mockAuthClient.send).toHaveBeenCalledWith('user.soft_delete', { id: '123' });
    });

    it('rejects a user attempting to delete another account with 403', () => {
      expect(() => controller.softDeleteUser('456', normalUser)).toThrow(
        ForbiddenException,
      );
      expect(mockAuthClient.send).not.toHaveBeenCalled();
    });

    it('allows an admin to delete any account', () => {
      expect(() => controller.softDeleteUser('456', adminUser)).not.toThrow();
      expect(mockAuthClient.send).toHaveBeenCalledWith('user.soft_delete', { id: '456' });
    });
  });
});
