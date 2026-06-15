import jwt from 'jsonwebtoken';
import { Request, Response } from 'express';
import { rateLimitKey, keyType, handleGlobalLimit } from './rate-limit.middleware';

function reqWith(opts: { auth?: string; deviceId?: string; ip?: string }): Request {
  return {
    headers: {
      ...(opts.auth ? { authorization: opts.auth } : {}),
      ...(opts.deviceId ? { 'x-device-id': opts.deviceId } : {}),
    },
    ip: opts.ip ?? '9.9.9.9',
    method: 'GET',
    path: '/chat/conversations/abc/messages',
  } as unknown as Request;
}

describe('rateLimitKey precedence (user > device > IP)', () => {
  it('keys by JWT subject when a bearer token is present', () => {
    const token = jwt.sign({ sub: 'user-123' }, 'any-secret'); // decode, not verify
    expect(rateLimitKey(reqWith({ auth: `Bearer ${token}`, deviceId: 'dev-1' }))).toBe('u:user-123');
  });

  it('falls back to device id when there is no usable token', () => {
    expect(rateLimitKey(reqWith({ deviceId: 'dev-1', ip: '1.2.3.4' }))).toBe('d:dev-1');
  });

  it('falls back to IP when there is no token and no device id', () => {
    expect(rateLimitKey(reqWith({ ip: '1.2.3.4' }))).toBe('ip:1.2.3.4');
  });

  it('falls through to device/IP keying on a malformed bearer token', () => {
    expect(rateLimitKey(reqWith({ auth: 'Bearer not-a-jwt', deviceId: 'dev-1' }))).toBe('d:dev-1');
  });
});

describe('keyType', () => {
  it('extracts the bucket prefix', () => {
    expect(keyType('u:user-123')).toBe('u');
    expect(keyType('d:dev-1')).toBe('d');
    expect(keyType('ip:1.2.3.4')).toBe('ip');
  });

  it('defaults to ip for an unprefixed key', () => {
    expect(keyType('1.2.3.4')).toBe('ip');
  });
});

describe('handleGlobalLimit', () => {
  it('logs the block and returns the JSON envelope with 429', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const json = jest.fn();
    const res = { status: jest.fn().mockReturnValue({ json }) } as unknown as Response;

    handleGlobalLimit(reqWith({ deviceId: 'dev-1' }), res);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: expect.any(String) }),
    );
    expect(warn).toHaveBeenCalledWith(
      '[rate-limit] 429',
      expect.objectContaining({ limiter: 'global', keyType: 'd', method: 'GET' }),
    );
    warn.mockRestore();
  });
});
