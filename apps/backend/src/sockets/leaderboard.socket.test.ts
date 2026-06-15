import {
  boardRoom,
  parseBoardRoom,
  isValidBoard,
  isValidPeriod,
} from './leaderboard.socket';

describe('boardRoom / parseBoardRoom', () => {
  it('round-trips a board + period segment', () => {
    const room = boardRoom('agent', 'daily');
    expect(room).toBe('lb:agent:daily');
    expect(parseBoardRoom(room)).toEqual({ board: 'agent', seg: 'daily' });
  });

  it('round-trips a state board + country segment', () => {
    const room = boardRoom('state', 'IN');
    expect(room).toBe('lb:state:IN');
    expect(parseBoardRoom(room)).toEqual({ board: 'state', seg: 'IN' });
  });

  it('returns null for non-leaderboard rooms', () => {
    expect(parseBoardRoom('user:123')).toBeNull();
    expect(parseBoardRoom('lb:')).toBeNull();
    expect(parseBoardRoom('lb:agent')).toBeNull();
  });
});

describe('isValidBoard / isValidPeriod', () => {
  it('accepts known boards/periods', () => {
    expect(isValidBoard('agent')).toBe(true);
    expect(isValidBoard('creator')).toBe(true);
    expect(isValidBoard('state')).toBe(true);
    expect(isValidPeriod('daily')).toBe(true);
    expect(isValidPeriod('weekly')).toBe(true);
    expect(isValidPeriod('monthly')).toBe(true);
  });

  it('rejects unknown / unsupported values', () => {
    expect(isValidBoard('game')).toBe(false);
    expect(isValidBoard('../etc')).toBe(false);
    expect(isValidPeriod('yearly')).toBe(false);
  });
});
