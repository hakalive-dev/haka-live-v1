import { deriveCallChannelName } from './call-channel';

const UUID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const UUID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('deriveCallChannelName', () => {
  it('is symmetric regardless of argument order', () => {
    expect(deriveCallChannelName(UUID_A, UUID_B)).toBe(
      deriveCallChannelName(UUID_B, UUID_A),
    );
  });

  it('is under Agora 64-byte channel name limit', () => {
    const channel = deriveCallChannelName(UUID_A, UUID_B);
    expect(Buffer.byteLength(channel, 'utf8')).toBeLessThan(64);
  });

  it('uses call_ prefix and hex hash only', () => {
    const channel = deriveCallChannelName(UUID_A, UUID_B);
    expect(channel).toMatch(/^call_[a-f0-9]{32}$/);
  });

  it('produces distinct channels for different user pairs', () => {
    const other = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    expect(deriveCallChannelName(UUID_A, UUID_B)).not.toBe(
      deriveCallChannelName(UUID_A, other),
    );
  });
});
