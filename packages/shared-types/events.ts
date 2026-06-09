export const WS_EVENTS = {
  USER_JOINED: 'user.joined',
  USER_LEFT: 'user.left',
  ROLE_CHANGED: 'role.changed',
  SEAT_UPDATED: 'seat.updated',
  SEAT_INVITATION: 'seat.invitation',
  GIFT_SENT: 'gift.sent',
  MESSAGE_SENT: 'message.sent',
  ROOM_ENDED: 'room.ended',
  LISTENER_COUNT: 'listener.count',
  LEADERBOARD_UPDATE: 'leaderboard.update',
  LEVEL_UP: 'level.up',
} as const;

export const DM_EVENTS = {
  DELETED: 'dm:deleted',
} as const;

export type DmEvent = typeof DM_EVENTS[keyof typeof DM_EVENTS];

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
} as const;

export type CallEvent = typeof CALL_EVENTS[keyof typeof CALL_EVENTS];
