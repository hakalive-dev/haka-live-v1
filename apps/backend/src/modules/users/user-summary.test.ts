import {
  userSummarySelect,
  serializeUserSummary,
  parseEquippedCosmetics,
  emptyEquippedCosmetics,
} from './user-summary';

describe('user-summary', () => {
  describe('userSummarySelect', () => {
    it('includes the core summary fields', () => {
      const sel = userSummarySelect();
      expect(sel.id).toBe(true);
      expect(sel.username).toBe(true);
      expect(sel.displayName).toBe(true);
      expect(sel.avatar).toBe(true);
      expect(sel.hakaId).toBe(true);
      expect(sel.activeSpecialId).toBe(true);
      expect(sel.activeSpecialIdExpiresAt).toBe(true);
    });

    it('scopes storeItems to equipped, non-expired wearable cosmetics', () => {
      const sel = userSummarySelect();
      expect(sel.storeItems.where.isEquipped).toBe(true);
      expect(sel.storeItems.where.item.category.in).toContain('frame');
      expect(sel.storeItems.where.item.category.in).toContain('ring');
      expect(sel.storeItems.where.item.category.in).toContain('chat_bubble');
      expect(sel.storeItems.where.OR[0]).toEqual({ expiresAt: null });
      const second = sel.storeItems.where.OR[1] as { expiresAt: { gt: Date } };
      expect(second.expiresAt.gt).toBeInstanceOf(Date);
    });

    it('reselects item fields needed for display', () => {
      const sel = userSummarySelect();
      const itemSel = sel.storeItems.select.item.select;
      expect(itemSel).toEqual({
        id: true,
        name: true,
        image: true,
        previewImage: true,
        category: true,
        level: true,
      });
    });

    it('evaluates the expiry cutoff per call (not once at module load)', async () => {
      const a = userSummarySelect().storeItems.where.OR[1];
      await new Promise((r) => setTimeout(r, 5));
      const b = userSummarySelect().storeItems.where.OR[1];
      const aDate = (a as { expiresAt: { gt: Date } }).expiresAt.gt;
      const bDate = (b as { expiresAt: { gt: Date } }).expiresAt.gt;
      expect(bDate.getTime()).toBeGreaterThan(aDate.getTime());
    });
  });

  describe('parseEquippedCosmetics', () => {
    it('maps each equipped category to the correct field', () => {
      const out = parseEquippedCosmetics([
        { item: { id: 'r1', name: 'Gold Ring', image: 'ring.svga', previewImage: null, category: 'ring', level: '' } },
        { item: { id: 'c1', name: 'Bubble', image: 'bubble.svga', previewImage: 'bubble.png', category: 'chat_bubble', level: '' } },
      ]);
      expect(out.equippedRing?.id).toBe('r1');
      expect(out.equippedChatBubble?.id).toBe('c1');
      expect(out.equippedChatBubble?.previewImage).toBe('bubble.png');
      expect(out.equippedFrame).toBeNull();
    });
  });

  describe('serializeUserSummary', () => {
    const base = {
      id: 'u1',
      username: 'alice',
      displayName: 'Alice',
      avatar: 'avatar.png',
      hakaId: 'HAKA123',
      activeSpecialId: null as string | null,
      activeSpecialIdLevel: null as string | null,
      activeSpecialIdExpiresAt: null as Date | null,
      level: null as { richLevel: number; charmLevel: number } | null,
    };

    it('returns null cosmetics when the user has none equipped', () => {
      const out = serializeUserSummary({ ...base, storeItems: [] });
      expect(out.equippedFrame).toBeNull();
      expect(out.equippedRing).toBeNull();
      expect(out.equippedChatBubble).toBeNull();
      expect(out.activeSpecialId).toBeNull();
    });

    it('surfaces an equipped frame', () => {
      const out = serializeUserSummary({
        ...base,
        storeItems: [
          {
            item: {
              id: 'f1',
              name: 'Gold Frame',
              image: 'store/frames/1.svga',
              previewImage: null,
              category: 'frame',
              level: '',
            },
          },
        ],
      });
      expect(out.equippedFrame).toEqual({
        id: 'f1',
        name: 'Gold Frame',
        image: 'store/frames/1.svga',
        previewImage: null,
        category: 'frame',
        level: '',
      });
      expect(out.activeSpecialId).toBeNull();
    });

    it('preserves identity fields verbatim', () => {
      const out = serializeUserSummary({ ...base, storeItems: [] });
      expect(out.id).toBe('u1');
      expect(out.username).toBe('alice');
      expect(out.displayName).toBe('Alice');
      expect(out.avatar).toBe('avatar.png');
      expect(out.hakaId).toBe('HAKA123');
    });

    it('replaces hakaId with activeSpecialId when set and not expired', () => {
      const out = serializeUserSummary({
        ...base,
        activeSpecialId: '888888',
        activeSpecialIdExpiresAt: new Date(Date.now() + 86400000),
        storeItems: [],
      });
      expect(out.hakaId).toBe('888888');
      expect(out.originalHakaId).toBe('HAKA123');
      expect(out.activeSpecialId).toBe('888888');
    });

    it('falls back to hakaId when activeSpecialId is expired', () => {
      const out = serializeUserSummary({
        ...base,
        activeSpecialId: '888888',
        activeSpecialIdExpiresAt: new Date(Date.now() - 86400000),
        storeItems: [],
      });
      expect(out.hakaId).toBe('HAKA123');
      expect(out.originalHakaId).toBe('HAKA123');
      expect(out.activeSpecialId).toBeNull();
    });

    it('uses activeSpecialId when expiresAt is null (no expiry set)', () => {
      const out = serializeUserSummary({
        ...base,
        activeSpecialId: '123456',
        activeSpecialIdExpiresAt: null,
        storeItems: [],
      });
      expect(out.hakaId).toBe('123456');
      expect(out.activeSpecialId).toBe('123456');
    });

    it('falls back to hakaId when no activeSpecialId', () => {
      const out = serializeUserSummary({
        ...base,
        activeSpecialId: null,
        storeItems: [],
      });
      expect(out.hakaId).toBe('HAKA123');
      expect(out.originalHakaId).toBe('HAKA123');
      expect(out.activeSpecialId).toBeNull();
    });

    it('emptyEquippedCosmetics returns all null fields', () => {
      expect(emptyEquippedCosmetics()).toEqual({
        equippedFrame: null,
        equippedRing: null,
        equippedChatBubble: null,
        equippedMicVoiceWave: null,
        equippedProfileCard: null,
        equippedDynamicProfile: null,
      });
    });
  });
});
