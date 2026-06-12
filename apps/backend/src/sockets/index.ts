import http from 'http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { authMiddleware } from './auth';
import { registerRoomHandlers } from './rooms.socket';
import { registerChatHandlers } from './chat.socket';
import * as pkService from '../modules/pk/pk.service';
import { startPkMatchmaker } from '../jobs/pk-matchmaker.job';
import { PK_EVENTS, BATTLE_EVENTS } from '../shared-types';
import { setBattleEndCallback, recoverActiveBattles } from '../modules/normal-battle/normal-battle.service';
import { recoverActiveSessions } from '../modules/rooms/calculator.service';
import { recoverActiveCalls } from '../modules/chat/call.service';

let io: Server;

export function getIO(): Server {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

export function initSocketServer(httpServer: http.Server): Server {
  io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Redis adapter for horizontal scaling
  if (env.NODE_ENV !== 'test') {
    const pubClient = redis.duplicate();
    const subClient = redis.duplicate();
    // Duplicated clients don't inherit the parent's listeners, so attach their
    // own 'error' handlers to avoid ioredis "missing 'error' handler" warnings.
    pubClient.on('error', (err) => console.error('Redis pub client error:', err.message));
    subClient.on('error', (err) => console.error('Redis sub client error:', err.message));
    io.adapter(createAdapter(pubClient, subClient));
    console.log('🔌 Socket.io attached with Redis adapter');
  } else {
    console.log('🔌 Socket.io attached (in-memory, test mode)');
  }

  // JWT auth for all socket connections
  io.use(authMiddleware);

  // Register namespace handlers
  registerRoomHandlers(io);
  registerChatHandlers(io);

  pkService.setMatchEndCallback((matchId, result) => {
    io.to(`pk:${matchId}`).emit(PK_EVENTS.ENDED, result);
    io.in(`pk:${matchId}`).socketsLeave(`pk:${matchId}`);
  });

  setBattleEndCallback((battleId, result) => {
    io.to(`battle:${battleId}`).emit(BATTLE_EVENTS.ENDED, result);
    io.in(`battle:${battleId}`).socketsLeave(`battle:${battleId}`);
  });

  if (env.NODE_ENV !== 'test') {
    pkService.recoverActiveMatches().catch(console.error);
    recoverActiveBattles().catch(console.error);
    recoverActiveSessions().catch(console.error);
    recoverActiveCalls().catch(console.error);
    startPkMatchmaker(io);
  }

  return io;
}
