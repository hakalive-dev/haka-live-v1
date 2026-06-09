const GIFT_ICON_ASSETS: Record<string, ReturnType<typeof require>> = {
  'gifts/86.png': require('../../assets/gifts/86.png'),
  'gifts/93.png': require('../../assets/gifts/93.png'),
  'gifts/116.png': require('../../assets/gifts/116.png'),
  'gifts/121.png': require('../../assets/gifts/121.png'),
};

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isLikelyEmoji(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.includes('/') || isHttpUrl(trimmed)) return false;
  return trimmed.length <= 8;
}

function resolveAssetOrRemote(
  key: string,
): { kind: 'bundled'; value: ReturnType<typeof require> } | { kind: 'remote'; value: string } | null {
  const bundled = GIFT_ICON_ASSETS[key];
  if (bundled) return { kind: 'bundled', value: bundled };
  if (isHttpUrl(key)) return { kind: 'remote', value: key };
  return null;
}

export type GiftIconSource =
  | { kind: 'bundled'; value: ReturnType<typeof require> }
  | { kind: 'remote'; value: string }
  | { kind: 'emoji'; value: string }
  | { kind: 'fallback' };

/**
 * Resolve gift.icon (or gift.image when icon is empty) for inline chat / UI display.
 */
export function resolveGiftIconSource(
  giftIcon: string,
  giftImageFallback?: string | null,
): GiftIconSource {
  const icon = giftIcon.trim();
  if (icon) {
    const asset = resolveAssetOrRemote(icon);
    if (asset) return asset;
    if (isLikelyEmoji(icon)) return { kind: 'emoji', value: icon };
  }

  const fallback = (giftImageFallback ?? '').trim();
  if (fallback) {
    const asset = resolveAssetOrRemote(fallback);
    if (asset) return asset;
  }

  return { kind: 'fallback' };
}

/**
 * DM gift bubbles: prefer catalogue PNG (`giftImage`) over emoji (`giftIcon`).
 */
export function resolveDmGiftBubbleSource(
  giftIcon: string,
  giftImage?: string | null,
): GiftIconSource {
  const imageKey = (giftImage ?? '').trim();
  if (imageKey) {
    const fromImage = resolveAssetOrRemote(imageKey);
    if (fromImage) return fromImage;
  }
  return resolveGiftIconSource(giftIcon, giftImage);
}
