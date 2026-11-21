import { Inject, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ClientProxy } from '@nestjs/microservices';
import {
  firstValueFrom,
  timeout,
  catchError,
  throwError,
  TimeoutError,
} from 'rxjs';
import { JwtService } from '@nestjs/jwt';
import { env } from 'apps/api/src/config/env.config';
import { PresenceService } from './presence.service';

@WebSocketGateway({
  cors: {
    origin: (origin, callback) => {
      const allowedOrigins = [
        env.FRONTEND_URL,
        'http://localhost:3000',
        'http://localhost:80',
        'http://localhost:8080',
      ];
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    @Inject('CHAT_SERVICE') private readonly chatClient: ClientProxy,
    private readonly jwtService: JwtService,
    private readonly presenceService: PresenceService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      let token: string | undefined =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

      if (!token && client.handshake.headers?.cookie) {
        const cookies = client.handshake.headers.cookie.split(';').reduce(
          (acc, c) => {
            const [k, v] = c.trim().split('=');
            if (k && v) acc[k] = decodeURIComponent(v);
            return acc;
          },
          {} as Record<string, string>,
        );
        token = cookies['access_token'];
      }

      if (!token) {
        this.logger.warn(
          `Socket connection rejected: No token provided (${client.id})`,
        );
        client.emit('auth_error', { message: 'Authentication token required' });
        client.disconnect(true);
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: env.JWT_SECRET,
      });
      client.data.user = payload;
      (client as any).user = {
        userId: payload.sub,
        name: payload.name,
        email: payload.email,
      };
      this.logger.log(
        `Socket client connected: ${client.id} (user: ${payload.sub})`,
      );

      // Register connection for presence tracking
      const becameOnline = await this.presenceService.addConnection(
        payload.sub,
        client.id,
      );

      // Send current online users list to connecting client
      const onlineUsers = await this.presenceService.getOnlineUsers();
      client.emit('onlineUsers', onlineUsers);

      const instanceId =
        process.env.INSTANCE_ID || `gateway-${process.env.PORT || 8008}`;
      client.emit('gatewayConnected', { instanceId });

      // Broadcast status change if user just became online
      if (becameOnline) {
        this.server.emit('userStatusChanged', {
          userId: payload.sub,
          status: 'online',
        });
      }
    } catch (err: any) {
      this.logger.warn(
        `Socket connection token verification failed (${client.id}): ${err.message}`,
      );
      client.emit('auth_error', { message: 'Invalid or expired token' });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`Socket client disconnected: ${client.id}`);

    const userId = client.data?.user?.sub ?? (client as any).user?.userId;
    if (userId) {
      const becameOffline = await this.presenceService.removeConnection(
        userId,
        client.id,
      );
      if (becameOffline) {
        this.server.emit('userStatusChanged', {
          userId,
          status: 'offline',
        });
      }
    }
  }

  @SubscribeMessage('getOnlineUsers')
  async handleGetOnlineUsers() {
    return this.presenceService.getOnlineUsers();
  }

  @SubscribeMessage('joinConversation')
  handleJoinConversation(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (data?.conversationId) {
      client.join(data.conversationId);
      this.logger.log(
        `Client ${client.id} joined room: ${data.conversationId}`,
      );
      return { success: true, conversationId: data.conversationId };
    }
  }

  @SubscribeMessage('leaveConversation')
  handleLeaveConversation(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (data?.conversationId) {
      client.leave(data.conversationId);
      this.logger.log(`Client ${client.id} left room: ${data.conversationId}`);
      return { success: true, conversationId: data.conversationId };
    }
  }

  @SubscribeMessage('sendMessage')
  async handleMessage(
    @MessageBody()
    payload: {
      text: string;
      conversationId: string;
      clientMessageId?: string;
    },
    @ConnectedSocket() client: Socket,
  ) {
    const senderId = client.data?.user?.sub ?? (client as any).user?.userId;

    if (!senderId) {
      return { error: 'Unauthorized sender' };
    }

    try {
      const savedMessage = await firstValueFrom(
        this.chatClient
          .send('save_message', {
            conversationId: payload.conversationId,
            text: payload.text,
            senderId,
            clientMessageId: payload.clientMessageId,
          })
          .pipe(
            timeout(10000),
            catchError((err) => {
              if (err instanceof TimeoutError) {
                return throwError(() => new Error('Message service timeout'));
              }
              return throwError(() => err);
            }),
          ),
      );

      this.server.to(payload.conversationId).emit('newMessage', savedMessage);
      this.server.emit('conversationUpdated', {
        conversationId: payload.conversationId,
        lastMessageSnippet: payload.text,
        lastMessageAt: new Date(),
      });

      return savedMessage;
    } catch (err: any) {
      this.logger.error(`Error saving message: ${err.message}`);
      return { error: err.message || 'Failed to send message' };
    }
  }
}
