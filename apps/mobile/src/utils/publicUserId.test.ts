import {
  idsMatch,
  normalizeIdForCompare,
  resolvePublicUserId,
  stripIdLabel,
} from './publicUserId';

describe('publicUserId', () => {
  describe('resolvePublicUserId', () => {
    it('prefers activeSpecialId over hakaId', () => {
      expect(
        resolvePublicUserId({
          activeSpecialId: '777777',
          hakaId: '500000001',
          username: 'user1',
        }),
      ).toBe('777777');
    });

    it('falls back to hakaId then username', () => {
      expect(resolvePublicUserId({ hakaId: '500000001', username: 'user1' })).toBe(
        '500000001',
      );
      expect(resolvePublicUserId({ username: 'user1' })).toBe('user1');
    });
  });

  describe('stripIdLabel', () => {
    it('removes leading ID: prefix', () => {
      expect(stripIdLabel('ID: 500000001')).toBe('500000001');
      expect(stripIdLabel('id:500000001')).toBe('500000001');
    });
  });

  describe('idsMatch', () => {
    it('matches headline and public id case-insensitively', () => {
      expect(idsMatch('500000001', '500000001')).toBe(true);
      expect(idsMatch('ID: 500000001', '500000001')).toBe(true);
      expect(idsMatch('500000001', 'My Room')).toBe(false);
    });

    it('normalizeIdForCompare strips label', () => {
      expect(normalizeIdForCompare('ID: 777777')).toBe('777777');
    });
  });
});
