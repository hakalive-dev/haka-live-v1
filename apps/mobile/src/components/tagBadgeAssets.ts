import type React from 'react';
import type { ImageSourcePropType } from 'react-native';
import type { SvgProps } from 'react-native-svg';
import { API_BASE_URL } from '@/api/client';

import ModeratorSvg from '../../assets/tag-icons/moderator.svg';
import AssistantSvg from '../../assets/tag-icons/assistant.svg';
import OperatorSvg from '../../assets/tag-icons/operator.svg';

export interface TagSummary {
  name: string;
  displayName: string;
  color: string;
  iconUrl: string;
  /** From admin catalogue; lower = shown first (matches tag-icons order). */
  sortOrder?: number;
}

/**
 * Default badge order when `sortOrder` is missing (legacy API / offline).
 * Aligns with built-in admin tag seed and `assets/tag-icons/*.png` names.
 */
const TAG_DISPLAY_ORDER: Record<string, number> = {
  super_admin: 0,
  admin: 1,
  cs: 2,
  moderator: 3,
  assistant: 4,
  operator: 5,
  bd: 6,
  bdm: 7,
  coin_seller: 8,
  senior_seller: 9,
  seller: 10,
};

function tagSortRank(tag: TagSummary): number {
  if (typeof tag.sortOrder === 'number' && Number.isFinite(tag.sortOrder)) {
    return tag.sortOrder;
  }
  const key = resolveTagAssetKey(tag.name);
  return TAG_DISPLAY_ORDER[key] ?? TAG_DISPLAY_ORDER[tag.name] ?? 999;
}

/** Staff / catalogue tags left-to-right: catalogue order, then name. */
export function sortTagsForDisplay(tags: TagSummary[]): TagSummary[] {
  return [...tags].sort((a, b) => {
    const diff = tagSortRank(a) - tagSortRank(b);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  });
}

type SvgComponent = React.FC<SvgProps>;

/** Maps API tag names to bundled asset keys. */
export function resolveTagAssetKey(name: string): string {
  if (name === 'bdm') return 'bd';
  if (name === 'senior_seller') return 'seller';
  return name;
}

interface PngTagAsset {
  kind: 'png';
  source: ImageSourcePropType;
  natW: number;
  natH: number;
}

interface SvgTagAsset {
  kind: 'svg';
  Component: SvgComponent;
  natW: number;
  natH: number;
}

export type TagAsset = PngTagAsset | SvgTagAsset;

/** Logical height (dp) — keep in sync with bundled PNG natH (~3× for retina sharpness). */
export const TAG_BADGE_HEIGHT_SM = 18;
export const TAG_BADGE_HEIGHT_MD = 22;
export const ROLE_TAG_BADGE_HEIGHT = 18;

const TAG_PNG: Record<string, Omit<PngTagAsset, 'kind'>> = {
  super_admin: {
    source: require('../../assets/tag-icons/super_admin.png'),
    natW: 480,
    natH: 90,
  },
  admin: {
    source: require('../../assets/tag-icons/admin.png'),
    natW: 156,
    natH: 42,
  },
  cs: {
    source: require('../../assets/tag-icons/cs.png'),
    natW: 105,
    natH: 42,
  },
  bd: {
    source: require('../../assets/tag-icons/bd.png'),
    natW: 1280,
    natH: 398,
  },
  coin_seller: {
    source: require('../../assets/tag-icons/coin_seller.png'),
    natW: 251,
    natH: 54,
  },
  seller: {
    source: require('../../assets/tag-icons/seller.png'),
    natW: 150,
    natH: 42,
  },
};

const TAG_SVG: Record<string, { Component: SvgComponent; natW: number; natH: number }> = {
  moderator: { Component: ModeratorSvg, natW: 200, natH: 50 },
  assistant: { Component: AssistantSvg, natW: 190, natH: 50 },
  operator: { Component: OperatorSvg, natW: 180, natH: 50 },
};

export function getTagAsset(name: string): TagAsset | null {
  const key = resolveTagAssetKey(name);
  const png = TAG_PNG[key];
  if (png) return { kind: 'png', ...png };
  const svg = TAG_SVG[key];
  if (svg) return { kind: 'svg', ...svg };
  return null;
}

export function tagBadgeRenderSize(asset: TagAsset, targetH: number): { width: number; height: number } {
  const renderW = Math.round(asset.natW * (targetH / asset.natH));
  return { width: renderW, height: targetH };
}

export function resolveRemoteTagIconUrl(iconUrl: string): string | null {
  const trimmed = iconUrl?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  const apiRoot = API_BASE_URL.replace(/\/api\/v1\/?$/, '');
  return `${apiRoot}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`;
}

/** Role keys rendered by RoleTagImage (not staff tags from API). */
export type RoleTagKey = 'coin_seller' | 'super_admin' | 'admin';

export function getRoleTagAsset(roleKey: RoleTagKey): TagAsset | null {
  return getTagAsset(roleKey);
}

export function userHasStaffTag(tags: TagSummary[] | undefined, roleKey: 'super_admin' | 'admin'): boolean {
  if (!tags?.length) return false;
  return tags.some((t) => t.name === roleKey);
}
