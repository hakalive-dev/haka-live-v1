import { isValidSpecialIdFormat, assertValidSpecialIdFormat, SPECIAL_ID_REGEX } from './specialId';

describe('specialId format validator', () => {
  describe('isValidSpecialIdFormat', () => {
    it('accepts exactly 6 digits', () => {
      expect(isValidSpecialIdFormat('123456')).toBe(true);
      expect(isValidSpecialIdFormat('000000')).toBe(true);
      expect(isValidSpecialIdFormat('999999')).toBe(true);
    });

    it('accepts 6 digits including leading zeros', () => {
      expect(isValidSpecialIdFormat('089428')).toBe(true);
      expect(isValidSpecialIdFormat('000001')).toBe(true);
    });

    it('rejects fewer than 6 digits', () => {
      expect(isValidSpecialIdFormat('12345')).toBe(false);
      expect(isValidSpecialIdFormat('1')).toBe(false);
      expect(isValidSpecialIdFormat('')).toBe(false);
    });

    it('rejects more than 6 digits', () => {
      expect(isValidSpecialIdFormat('1234567')).toBe(false);
      expect(isValidSpecialIdFormat('12345678')).toBe(false);
      expect(isValidSpecialIdFormat('123456789')).toBe(false);
    });

    it('rejects non-digit characters', () => {
      expect(isValidSpecialIdFormat('12345a')).toBe(false);
      expect(isValidSpecialIdFormat('abcdef')).toBe(false);
      expect(isValidSpecialIdFormat('123 56')).toBe(false);
      expect(isValidSpecialIdFormat('123-56')).toBe(false);
    });

    it('rejects non-string input', () => {
      expect(isValidSpecialIdFormat(undefined as unknown as string)).toBe(false);
      expect(isValidSpecialIdFormat(null as unknown as string)).toBe(false);
      expect(isValidSpecialIdFormat(123456 as unknown as string)).toBe(false);
    });
  });

  describe('SPECIAL_ID_REGEX', () => {
    it('is anchored so partial matches are rejected', () => {
      expect(SPECIAL_ID_REGEX.test('a123456')).toBe(false);
      expect(SPECIAL_ID_REGEX.test('123456b')).toBe(false);
    });

    it('does not accidentally match 9-digit hakaIds (different namespace)', () => {
      expect(SPECIAL_ID_REGEX.test('123456789')).toBe(false);
    });
  });

  describe('assertValidSpecialIdFormat', () => {
    it('returns the candidate when valid', () => {
      expect(assertValidSpecialIdFormat('123456')).toBe('123456');
    });

    it('throws a descriptive error when invalid', () => {
      expect(() => assertValidSpecialIdFormat('abc')).toThrow(/6 digits/);
      expect(() => assertValidSpecialIdFormat('12345')).toThrow(/6 digits/);
      expect(() => assertValidSpecialIdFormat('1234567')).toThrow(/6 digits/);
    });
  });
});
