import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Radius, Spacing } from '@/theme';

type Props = {
  mediaUrl: string;
  caption?: string | null;
  isMine: boolean;
  onPress: () => void;
};

export function DmImageBubble({ mediaUrl, caption, isMine, onPress }: Props) {
  const [loadFailed, setLoadFailed] = useState(false);

  const handleError = useCallback(() => {
    setLoadFailed(true);
  }, []);

  return (
    <View style={styles.bubble}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        style={styles.imageWrap}
        disabled={loadFailed}
      >
        {loadFailed ? (
          <View style={styles.errorWrap}>
            <Ionicons name="image-outline" size={32} color={Colors.textTertiary} />
            <Text style={styles.errorText}>Image unavailable</Text>
          </View>
        ) : (
          <Image
            source={{ uri: mediaUrl }}
            style={styles.imageThumb}
            contentFit="cover"
            cachePolicy="memory-disk"
            onError={handleError}
          />
        )}
      </TouchableOpacity>
      {caption && caption.length > 0 ? (
        <Text style={[styles.caption, isMine ? styles.captionMine : styles.captionTheirs]}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    maxWidth: '72%',
    borderRadius: Radius.lg,
    padding: Spacing.xs,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  imageWrap: {
    width: 160,
    height: 160,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceHighlight,
  },
  imageThumb: {
    width: '100%',
    height: '100%',
  },
  errorWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    padding: Spacing.sm,
  },
  errorText: {
    fontSize: 11,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  captionMine: {
    color: Colors.textPrimary,
  },
  captionTheirs: {
    color: Colors.textPrimary,
  },
});
