import React, { useEffect, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';

import { RootStackScreenProps } from '@navigation/types';
import { giftsApi } from '@api/gifts';
import { Colors, Spacing } from '@/theme';

type Props = RootStackScreenProps<'GiftGallery'>;

type GalleryGift = {
  key: string;
  name: string;
  icon: string;
  image: string | null;
  qty: number;
};

const { width: SCREEN_W } = Dimensions.get('window');
const NUM_COLS = 5;
const H_PAD = Spacing.lg;
const CELL_GAP = 8;
const CELL_SIZE = Math.floor((SCREEN_W - H_PAD * 2 - CELL_GAP * (NUM_COLS - 1)) / NUM_COLS);

export function GiftGalleryScreen({ route, navigation }: Props) {
  const { userId, displayName } = route.params;
  const insets = useSafeAreaInsets();

  const [gifts, setGifts] = useState<GalleryGift[]>([]);
  const [loading, setLoading] = useState(true);

  useLayoutEffect(() => {
    navigation.setOptions({ title: displayName, headerBackTitle: '' });
  }, [navigation, displayName]);

  useEffect(() => {
    setLoading(true);
    giftsApi
      .received(userId, 200)
      .then((rows) =>
        setGifts(
          rows.map((g) => ({
            key: g.id,
            name: g.name,
            icon: g.icon,
            image: g.image,
            qty: g.qty,
          })),
        ),
      )
      .catch(() => setGifts([]))
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
      <FlatList
        data={gifts}
        keyExtractor={(item) => item.key}
        numColumns={NUM_COLS}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={<Text style={styles.pageTitle}>Gifts Wall</Text>}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="gift-outline" size={48} color={Colors.textTertiary} />
            <Text style={styles.emptyText}>No gifts received yet</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.cell}>
            {item.image ? (
              <Image
                source={{ uri: item.image }}
                style={styles.giftImg}
                contentFit="contain"
              />
            ) : (
              <Text style={styles.giftEmoji}>{item.icon}</Text>
            )}
            <Text style={styles.qty}>x{item.qty}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  listContent: {
    paddingHorizontal: H_PAD,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
    gap: CELL_GAP,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1A1A1A',
    marginBottom: Spacing.md,
  },
  cell: {
    width: CELL_SIZE,
    alignItems: 'center',
    marginRight: CELL_GAP,
    marginBottom: CELL_GAP,
  },
  giftImg: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    backgroundColor: 'transparent',
  },
  giftEmoji: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    fontSize: CELL_SIZE * 0.55,
    textAlign: 'center',
    lineHeight: CELL_SIZE,
  },
  qty: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1A1A1A',
    marginTop: 2,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 12,
  },
  emptyText: { fontSize: 14, color: Colors.textTertiary },
});
