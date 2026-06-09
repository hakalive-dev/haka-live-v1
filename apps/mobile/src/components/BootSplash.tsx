import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { HAKA_LOGO_MARK } from '@/constants/app-logo';
import { Colors, Spacing } from '@/theme';

type BootSplashProps = {
  /** Show spinner + slow-start hint (root boot only). */
  showSpinner?: boolean;
};

export function BootSplash({ showSpinner = true }: BootSplashProps) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!showSpinner) return;
    const t = setTimeout(() => setSlow(true), 5000);
    return () => clearTimeout(t);
  }, [showSpinner]);

  return (
    <View style={styles.container}>
      <View style={styles.logoClip}>
        <Image source={HAKA_LOGO_MARK} style={styles.logo} contentFit="contain" />
      </View>
      <Text style={styles.title}>HAKA LIVE</Text>
      {showSpinner ? (
        <ActivityIndicator style={styles.spinner} color={Colors.primary} />
      ) : null}
      {showSpinner && slow ? (
        <Text style={styles.hint}>Taking longer than usual… the server may be waking up.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  logoClip: {
    width: 120,
    height: 120,
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  logo: {
    width: 120,
    height: 120,
    borderRadius: 24,
  },
  title: {
    color: Colors.primary,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: Spacing.lg,
  },
  spinner: {
    marginTop: Spacing.sm,
  },
  hint: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    color: Colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
  },
});

