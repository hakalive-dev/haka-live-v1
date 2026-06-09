import {
  buildLoginPasswordDisplay,
  encryptPasswordSnapshot,
  decryptPasswordSnapshot,
} from './password-snapshot';

describe('password-snapshot', () => {
  it('encrypts and decrypts round-trip', () => {
    const enc = encryptPasswordSnapshot('haka2024');
    expect(enc).toBeTruthy();
    expect(decryptPasswordSnapshot(enc)).toBe('haka2024');
  });

  it('buildLoginPasswordDisplay matches AccountScreen logic', () => {
    const enc = encryptPasswordSnapshot('secret123');
    const withSnapshot = buildLoginPasswordDisplay(enc, true);
    expect(withSnapshot.display).toBe('secret123');
    expect(withSnapshot.copyable).toBe(true);

    const masked = buildLoginPasswordDisplay('', true);
    expect(masked.display).toBe('••••••');
    expect(masked.copyable).toBe(false);

    const notSet = buildLoginPasswordDisplay('', false);
    expect(notSet.display).toBe('Not set');
    expect(notSet.copyable).toBe(false);
  });
});
