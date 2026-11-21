import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ChatGateway } from './chat.gateway';
import { PresenceService } from './presence.service';

jest.mock('apps/api/src/config/env.config', () => ({
  env: { JWT_SECRET: 'test-secret' },
}));

describe('ChatGateway', () => {
  let gateway: ChatGateway;
  let presence: Record<string, jest.Mock>;
  let jwt: { verify: jest.Mock };
  let serverEmit: jest.Mock;

  const makeSocket = (overrides: Record<string, unknown> = {}) =>
    ({
      id: 'socket-1',
      data: {},
      handshake: { auth: { token: 'token' }, headers: {} },
      emit: jest.fn(),
      disconnect: jest.fn(),
      ...overrides,
    }) as any;

  beforeEach(async () => {
    presence = {
      addConnection: jest.fn(),
      removeConnection: jest.fn(),
      getOnlineUsers: jest.fn().mockResolvedValue([]),
      heartbeat: jest.fn(),
      sweepStale: jest.fn(),
      logError: jest.fn(),
    };
    jwt = { verify: jest.fn().mockReturnValue({ sub: 7, name: 'Alice' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatGateway,
        { provide: 'CHAT_SERVICE', useValue: { send: jest.fn() } },
        { provide: JwtService, useValue: jwt },
        { provide: PresenceService, useValue: presence },
      ],
    }).compile();

    gateway = module.get(ChatGateway);
    serverEmit = jest.fn();
    gateway.server = {
      emit: serverEmit,
      sockets: { sockets: new Map() },
    } as any;
  });

  it('keeps an authenticated socket connected when presence (Redis) fails', async () => {
    presence.addConnection.mockRejectedValue(new Error('The client is closed'));
    const socket = makeSocket();

    await gateway.handleConnection(socket);

    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(socket.emit).not.toHaveBeenCalledWith(
      'auth_error',
      expect.anything(),
    );
    expect(presence.logError).toHaveBeenCalled();
  });

  it('still rejects a socket with an invalid token', async () => {
    jwt.verify.mockImplementation(() => {
      throw new Error('jwt expired');
    });
    const socket = makeSocket();

    await gateway.handleConnection(socket);

    expect(socket.emit).toHaveBeenCalledWith('auth_error', expect.anything());
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('does not throw from handleDisconnect when presence (Redis) fails', async () => {
    presence.removeConnection.mockRejectedValue(
      new Error('The client is closed'),
    );
    const socket = makeSocket({ data: { user: { sub: 7 } } });

    await expect(gateway.handleDisconnect(socket)).resolves.toBeUndefined();
  });

  it('broadcasts offline for users swept from a dead gateway', async () => {
    presence.sweepStale.mockResolvedValue(['7']);

    await gateway.sweepPresence();

    expect(serverEmit).toHaveBeenCalledWith('userStatusChanged', {
      userId: '7',
      status: 'offline',
    });
  });

  it('refreshes the sockets connected to this gateway', async () => {
    const local = makeSocket({ id: 'socket-9', data: { user: { sub: 7 } } });
    (gateway.server as any).sockets.sockets.set(local.id, local);
    presence.heartbeat.mockResolvedValue([]);

    await gateway.refreshPresence();

    expect(presence.heartbeat).toHaveBeenCalledWith([
      { userId: '7', socketId: 'socket-9' },
    ]);
  });
});
