import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Circle } from 'react-native-svg';

import { Colors } from '@/theme';
import { PAYOUT_PROVIDER_BRANDS } from './payoutProviderBrands';
import {
  PAYOUT_WORDMARK_PROVIDERS,
  resolvePayoutRasterIcon,
  resolvePayoutSvgIcon,
} from './payoutMethodIconRegistry';

const DEFAULT_SIZE = 44;

export interface PayoutMethodIconProps {
  provider: string;
  methodType?: string;
  category?: string;
  size?: number;
}

function BrandMonogramIcon({
  provider,
  size,
}: {
  provider: string;
  size: number;
}) {
  const brand =
    PAYOUT_PROVIDER_BRANDS[provider.toLowerCase()] ??
    PAYOUT_PROVIDER_BRANDS[provider.replace(/-/g, '_').toLowerCase()];

  if (!brand) {
    return (
      <View style={[styles.fallback, { width: size, height: size, borderRadius: size / 2 }]}>
        <Text style={[styles.fallbackText, { fontSize: size * 0.38 }]}>₿</Text>
      </View>
    );
  }

  const fontSize =
    brand.monogram.length >= 3 ? size * 0.22 : brand.monogram.length === 2 ? size * 0.28 : size * 0.36;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={brand.backgroundColor} />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.monogramWrap]}>
        <Text
          style={[styles.monogram, { color: brand.foregroundColor, fontSize }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {brand.monogram}
        </Text>
      </View>
    </View>
  );
}

function IconTile({
  size,
  children,
  lightBackground = true,
}: {
  size: number;
  children: React.ReactNode;
  lightBackground?: boolean;
}) {
  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: lightBackground ? Colors.background : 'transparent',
        },
      ]}
    >
      {children}
    </View>
  );
}

export function PayoutMethodIcon({
  provider,
  methodType,
  category,
  size = DEFAULT_SIZE,
}: PayoutMethodIconProps) {
  const key = provider?.toLowerCase() ?? '';
  const raster = resolvePayoutRasterIcon(key);
  const SvgIcon = resolvePayoutSvgIcon(key, methodType);
  const isWordmark = PAYOUT_WORDMARK_PROVIDERS.has(key);

  if (raster) {
    return (
      <IconTile size={size}>
        <Image
          source={raster}
          style={{ width: size * 0.82, height: size * 0.36 }}
          contentFit="contain"
        />
      </IconTile>
    );
  }

  if (SvgIcon) {
    const markW = isWordmark ? size * 0.84 : size * 0.58;
    const markH = isWordmark ? size * 0.3 : size * 0.58;
    return (
      <IconTile size={size} lightBackground={isWordmark}>
        <SvgIcon width={markW} height={markH} />
      </IconTile>
    );
  }

  if (category === 'bank' || methodType === 'bank_account') {
    const BankIcon = resolvePayoutSvgIcon('bank_inr', 'bank_account');
    if (BankIcon) {
      return (
        <IconTile size={size}>
          <BankIcon width={size * 0.55} height={size * 0.55} />
        </IconTile>
      );
    }
  }

  return <BrandMonogramIcon provider={key} size={size} />;
}

const styles = StyleSheet.create({
  tile: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  monogramWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  monogram: {
    fontWeight: '700',
    textAlign: 'center',
  },
  fallback: {
    backgroundColor: Colors.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    color: Colors.primary,
    fontWeight: '700',
  },
});
