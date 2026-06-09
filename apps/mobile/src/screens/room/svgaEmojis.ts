export type EmojiAssetType = 'svga' | 'webp';

export interface SvgaEmoji {
  key: string;
  label: string;
  asset: number;
  thumb: number;
  type: EmojiAssetType;
  tier: 'normal' | 'svip';
  /**
   * Per-asset overlap multiplier applied on top of the seat size when the
   * effect is rendered on a seated user. Optional — when omitted, the seat
   * effect falls back to a tier-based default (see SeatSvgaEffect).
   */
  seatScale?: number;
}

function normal(key: string, label: string, asset: number, thumb: number, type: EmojiAssetType = 'svga'): SvgaEmoji {
  return { key, label, asset, thumb, type, tier: 'normal' };
}

function svip(key: string, label: string, asset: number, thumb: number, type: EmojiAssetType = 'svga'): SvgaEmoji {
  return { key, label, asset, thumb, type, tier: 'svip' };
}

// Keys match the on-disk filenames (without extension). Labels are the picker captions.
export const NORMAL_EMOJIS: SvgaEmoji[] = [
  // Numeric SVGAs
  normal('1611577881374', 'Kiss',    require('../../../assets/emojis/normal/1611577881374.svga'), require('../../../assets/emojis/normal/thumbs/1611577881374.png')),
  normal('1611577859965', 'Love',    require('../../../assets/emojis/normal/1611577859965.svga'), require('../../../assets/emojis/normal/thumbs/1611577859965.png')),
  normal('1611561898139', 'ROFL',    require('../../../assets/emojis/normal/1611561898139.svga'), require('../../../assets/emojis/normal/thumbs/1611561898139.png')),
  normal('1611577805375', 'Tongue',  require('../../../assets/emojis/normal/1611577805375.svga'), require('../../../assets/emojis/normal/thumbs/1611577805375.png')),
  normal('1611577416731', 'Yummy',   require('../../../assets/emojis/normal/1611577416731.svga'), require('../../../assets/emojis/normal/thumbs/1611577416731.png')),
  normal('1611561970084', 'Sobbing', require('../../../assets/emojis/normal/1611561970084.svga'), require('../../../assets/emojis/normal/thumbs/1611561970084.png')),
  normal('1611577176442', 'Shocked', require('../../../assets/emojis/normal/1611577176442.svga'), require('../../../assets/emojis/normal/thumbs/1611577176442.png')),
  normal('1601185839692', 'Shush',   require('../../../assets/emojis/normal/1601185839692.svga'), require('../../../assets/emojis/normal/thumbs/1601185839692.png')),
  normal('1611577771602', 'Sleepy',  require('../../../assets/emojis/normal/1611577771602.svga'), require('../../../assets/emojis/normal/thumbs/1611577771602.png')),
  normal('1611577960187', 'Hi',      require('../../../assets/emojis/normal/1611577960187.svga'), require('../../../assets/emojis/normal/thumbs/1611577960187.png')),
  normal('1611577905602', 'Hurray',  require('../../../assets/emojis/normal/1611577905602.svga'), require('../../../assets/emojis/normal/thumbs/1611577905602.png')),
  normal('1601186116079', 'Music',   require('../../../assets/emojis/normal/1601186116079.svga'), require('../../../assets/emojis/normal/thumbs/1601186116079.png')),
  normal('1601186245299', 'Whistle', require('../../../assets/emojis/normal/1601186245299.svga'), require('../../../assets/emojis/normal/thumbs/1601186245299.png')),
  normal('1611577244212', 'Sing',    require('../../../assets/emojis/normal/1611577244212.svga'), require('../../../assets/emojis/normal/thumbs/1611577244212.png')),
  normal('1611577086549', 'Cheers',  require('../../../assets/emojis/normal/1611577086549.svga'), require('../../../assets/emojis/normal/thumbs/1611577086549.png')),
  normal('1601186343678', 'Snack',   require('../../../assets/emojis/normal/1601186343678.svga'), require('../../../assets/emojis/normal/thumbs/1601186343678.png')),
  normal('(168)',         'Party',   require('../../../assets/emojis/normal/(168).svga'),         require('../../../assets/emojis/normal/thumbs/(168).png')),
  normal('(140)',         'Slots',   require('../../../assets/emojis/normal/(140).svga'),         require('../../../assets/emojis/normal/thumbs/(140).png')),
  normal('1611577282961', 'Cool',    require('../../../assets/emojis/normal/1611577282961.svga'), require('../../../assets/emojis/normal/thumbs/1611577282961.png')),
  normal('1611577355606', 'Hmm',     require('../../../assets/emojis/normal/1611577355606.svga'), require('../../../assets/emojis/normal/thumbs/1611577355606.png')),
  // Descriptive-original SVGAs
  normal('claping',        'Clap',    require('../../../assets/emojis/normal/claping.svga'),       require('../../../assets/emojis/normal/thumbs/claping.png')),
  normal('crying',         'Cry',     require('../../../assets/emojis/normal/crying.svga'),        require('../../../assets/emojis/normal/thumbs/crying.png')),
  normal('emojikissleft',  'Kiss L',  require('../../../assets/emojis/normal/emojikissleft.svga'), require('../../../assets/emojis/normal/thumbs/emojikissleft.png')),
  normal('emojikissright', 'Kiss R',  require('../../../assets/emojis/normal/emojikissright.svga'),require('../../../assets/emojis/normal/thumbs/emojikissright.png')),
  normal('emotion (4)',    'Sparkle', require('../../../assets/emojis/normal/emotion (4).svga'),   require('../../../assets/emojis/normal/thumbs/emotion (4).png')),
  normal('sorry',          'Sorry',   require('../../../assets/emojis/normal/sorry.svga'),         require('../../../assets/emojis/normal/thumbs/sorry.png')),
  // Animated WebP
  normal('1658907259022', 'Gift me', require('../../../assets/emojis/normal/1658907259022.webp'), require('../../../assets/emojis/normal/thumbs/1658907259022.png'), 'webp'),
  normal('1658907278534', 'Thanks',  require('../../../assets/emojis/normal/1658907278534.webp'), require('../../../assets/emojis/normal/thumbs/1658907278534.png'), 'webp'),
  normal('1658907295126', 'Welcome', require('../../../assets/emojis/normal/1658907295126.webp'), require('../../../assets/emojis/normal/thumbs/1658907295126.png'), 'webp'),
  normal('1658907314781', 'Angry',   require('../../../assets/emojis/normal/1658907314781.webp'), require('../../../assets/emojis/normal/thumbs/1658907314781.png'), 'webp'),
];

export const SVIP_EMOJIS: SvgaEmoji[] = [
  svip('1712736170074', 'Cool',     require('../../../assets/emojis/svip/1712736170074.svga'), require('../../../assets/emojis/svip/thumbs/1712736170074.png')),
  svip('1712807506011', 'Wow',      require('../../../assets/emojis/svip/1712807506011.svga'), require('../../../assets/emojis/svip/thumbs/1712807506011.png')),
  svip('1712807547446', 'Shades',   require('../../../assets/emojis/svip/1712807547446.svga'), require('../../../assets/emojis/svip/thumbs/1712807547446.png')),
  svip('1712807681481', 'Huh?',     require('../../../assets/emojis/svip/1712807681481.svga'), require('../../../assets/emojis/svip/thumbs/1712807681481.png')),
  svip('1712807706442', 'Haha',     require('../../../assets/emojis/svip/1712807706442.svga'), require('../../../assets/emojis/svip/thumbs/1712807706442.png')),
  svip('1712807732067', 'Love',     require('../../../assets/emojis/svip/1712807732067.svga'), require('../../../assets/emojis/svip/thumbs/1712807732067.png')),
  svip('1712807760684', 'Yo!',      require('../../../assets/emojis/svip/1712807760684.svga'), require('../../../assets/emojis/svip/thumbs/1712807760684.png')),
  svip('1712807779689', 'Wave',     require('../../../assets/emojis/svip/1712807779689.svga'), require('../../../assets/emojis/svip/thumbs/1712807779689.png')),
  svip('1735205551271', 'Laugh',    require('../../../assets/emojis/svip/1735205551271.svga'), require('../../../assets/emojis/svip/thumbs/1735205551271.png')),
  svip('emotion (2)',   'Hi-5',     require('../../../assets/emojis/svip/emotion (2).svga'),   require('../../../assets/emojis/svip/thumbs/emotion (2).png')),
  svip('emotion (3)',   'Heart',    require('../../../assets/emojis/svip/emotion (3).svga'),   require('../../../assets/emojis/svip/thumbs/emotion (3).png')),
];

export const SVGA_EMOJIS: SvgaEmoji[] = [...NORMAL_EMOJIS, ...SVIP_EMOJIS];

export const SVGA_EMOJIS_BY_KEY: Record<string, SvgaEmoji> = Object.fromEntries(
  SVGA_EMOJIS.map((e) => [e.key, e]),
);
