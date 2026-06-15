export const WS_EVENTS = {
  USER_JOINED: 'user.joined',
  USER_LEFT: 'user.left',
  ROLE_CHANGED: 'role.changed',
  SEAT_UPDATED: 'seat.updated',
  GIFT_SENT: 'gift.sent',
  LUCKY_REWARD: 'lucky.reward',
  MESSAGE_SENT: 'message.sent',
  ROOM_ENDED: 'room.ended',
  LISTENER_COUNT: 'listener.count',
  LEADERBOARD_UPDATE: 'leaderboard.update',
  LEVEL_UP: 'level.up',
} as const;

export type WsEvent = typeof WS_EVENTS[keyof typeof WS_EVENTS];

export const PK_EVENTS = {
  INVITED:       'pk:invited',
  STARTED:       'pk:started',
  SCORE_UPDATED: 'pk:score.updated',
  ENDED:         'pk:ended',
  CANCELLED:     'pk:cancelled',
  FORFEIT:       'pk:forfeit',
} as const;

export type PkEvent = typeof PK_EVENTS[keyof typeof PK_EVENTS];

export const CALL_EVENTS = {
  INCOMING:  'call:incoming',
  DECLINED:  'call:declined',
  ENDED:     'call:ended',
  CANCELLED: 'call:cancelled',
  MISSED:    'call:missed',
} as const;

export type CallEvent = typeof CALL_EVENTS[keyof typeof CALL_EVENTS];

export type CallType = 'voice' | 'video';

export const BATTLE_EVENTS = {
  STARTED:       'battle:started',
  SCORE_UPDATED: 'battle:score.updated',
  ENDED:         'battle:ended',
  CANCELLED:     'battle:cancelled',
  VOTE:          'battle:vote',    // client → server
  CANCEL:        'battle:cancel',  // client → server (host)
} as const;

export type BattleEvent = typeof BATTLE_EVENTS[keyof typeof BATTLE_EVENTS];
