import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing } from '@/theme';

/**
 * Full-screen gate shown at startup when the backend can't be reached and there
 * is no cached content to render. Replaces the previous pure-white screen.
 */
export function BackendUnreachable({
  checking,
  onRetry,
}: {
  checking: boolean;
  onRetry: () => void;
}) {
  return (
    <View style={styles.gate}>
      <Image
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source={require('../assets/logo.png')}
        style={styles.logo}
        contentFit="contain"
      />
      <Text style={styles.title}>Can’t reach Haka Live</Text>
      <Text style={styles.body}>
        We couldn’t connect to the server. It may be starting up — please check your
        connection and try again.
      </Text>
      <TouchableOpacity
        style={[styles.button, checking && styles.buttonDisabled]}
        onPress={onRetry}
        disabled={checking}
        activeOpacity={0.85}
      >
        {checking ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>Retry</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

/**
 * Slim top banner shown over the app when the backend is unreachable but we
 * still have cached content to display. Tap to retry.
 */
export function ConnectionBanner({
  checking,
  onRetry,
}: {
  checking: boolean;
  onRetry: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <TouchableOpacity
      style={[styles.banner, { paddingTop: insets.top + 6 }]}
      onPress={onRetry}
      activeOpacity={0.9}
    >
      {checking ? (
        <ActivityIndicator color="#FFFFFF" size="small" />
      ) : null}
      <Text style={styles.bannerText}>
        {checking ? 'Reconnecting…' : 'Connection problem — tap to retry'}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  gate: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  logo: {
    width: 132,
    height: 122,
    marginBottom: Spacing.lg,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  body: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  button: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: 999,
    minWidth: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    backgroundColor: Colors.danger,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 8,
    paddingHorizontal: Spacing.md,
  },
  bannerText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
