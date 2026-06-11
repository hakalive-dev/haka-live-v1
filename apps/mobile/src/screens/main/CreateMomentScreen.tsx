import React, { useState, useCallback } from 'react';
import {
  Alert,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useQueryClient } from '@tanstack/react-query';

import { momentsApi } from '@api/moments';
import { queryKeys } from '@api/queryKeys';
import { Colors, Spacing, Radius } from '@/theme';
import { KeyboardAwareScroll } from '@components/keyboard';
import type { RootStackParamList } from '@navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'CreateMoment'>;

export function CreateMomentScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [postType, setPostType] = useState<'moment' | 'video'>(
    route.params?.postType ?? 'moment',
  );
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  const [caption, setCaption] = useState('');
  const [hashtag, setHashtag] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const mediaPickerTypes = postType === 'video'
    ? (['videos'] as const)
    : (['images'] as const);

  const applyPickedAsset = useCallback((asset: ImagePicker.ImagePickerAsset) => {
    setMediaUri(asset.uri);
    setMediaType(asset.type === 'video' ? 'video' : 'image');
  }, []);

  const launchMedia = useCallback(async (source: 'camera' | 'library') => {
    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert(
            'Permission required',
            postType === 'video'
              ? 'Please allow camera access to record a video.'
              : 'Please allow camera access to take a photo.',
          );
          return;
        }
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permission required', 'Please allow access to your media library.');
          return;
        }
      }

      const pickerOptions = {
        mediaTypes: mediaPickerTypes,
        allowsEditing: true,
        quality: 0.85,
        ...(postType === 'video' && source === 'camera' ? { videoMaxDuration: 60 } : {}),
        ...(Platform.OS === 'ios' && source === 'library'
          ? { presentationStyle: ImagePicker.UIImagePickerPresentationStyle.OVER_FULL_SCREEN }
          : {}),
      };

      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync(pickerOptions)
        : await ImagePicker.launchImageLibraryAsync(pickerOptions);

      if (!result.canceled && result.assets.length > 0) {
        applyPickedAsset(result.assets[0]);
      }
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to open camera or library');
    }
  }, [applyPickedAsset, mediaPickerTypes, postType]);

  const showMediaSourcePicker = useCallback(() => {
    const cameraLabel = postType === 'video' ? 'Record Video' : 'Take Photo';
    const libraryLabel = postType === 'video' ? 'Choose Video' : 'Choose from Library';

    Alert.alert('Add media', undefined, [
      { text: cameraLabel, onPress: () => launchMedia('camera') },
      { text: libraryLabel, onPress: () => launchMedia('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [launchMedia, postType]);

  const handleSubmit = useCallback(async () => {
    if (!mediaUri) {
      Alert.alert('No media selected', 'Please pick a photo or video first.');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('post_type', postType);
      formData.append('caption', caption.trim());
      formData.append('hashtag', hashtag.trim().startsWith('#')
        ? hashtag.trim()
        : hashtag.trim() ? `#${hashtag.trim()}` : '');

      const filename = mediaUri.split('/').pop() ?? 'media.jpg';
      const mimeType = mediaType === 'video' ? 'video/mp4' : 'image/jpeg';
      formData.append('media_file', {
        uri: mediaUri,
        name: filename,
        type: mimeType,
      } as any);

      await momentsApi.create(formData);
      await queryClient.invalidateQueries({ queryKey: queryKeys.discover.moments() });
      await queryClient.invalidateQueries({ queryKey: queryKeys.discover.videos() });
      Alert.alert('Posted!', 'Your moment has been shared.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to post');
    } finally {
      setSubmitting(false);
    }
  }, [mediaUri, mediaType, postType, caption, hashtag, navigation]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity hitSlop={8} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={26} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Post</Text>
        <TouchableOpacity
          style={[styles.postBtn, submitting && styles.postBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          <Text style={styles.postBtnText}>{submitting ? 'Posting…' : 'Post'}</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAwareScroll
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Type toggle */}
        <View style={styles.typeRow}>
          {(['moment', 'video'] as const).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.typeBtn, postType === t && styles.typeBtnActive]}
              onPress={() => { setPostType(t); setMediaUri(null); setMediaType(null); }}
            >
              <Ionicons
                name={t === 'moment' ? 'image-outline' : 'videocam-outline'}
                size={16}
                color={postType === t ? '#FFFFFF' : Colors.textSecondary}
              />
              <Text style={[styles.typeBtnText, postType === t && styles.typeBtnTextActive]}>
                {t === 'moment' ? 'Moment' : 'Video'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Media picker — camera or library */}
        <View style={styles.mediaPicker}>
          <TouchableOpacity
            style={styles.mediaPreviewTap}
            onPress={showMediaSourcePicker}
            activeOpacity={0.85}
          >
            {mediaUri ? (
              <Image
                source={{ uri: mediaUri }}
                style={styles.mediaPreview}
                contentFit="cover"
              />
            ) : (
              <View style={styles.mediaPlaceholder}>
                <Ionicons
                  name={postType === 'video' ? 'videocam-outline' : 'image-outline'}
                  size={48}
                  color={Colors.textTertiary}
                />
                <Text style={styles.mediaPlaceholderText}>
                  {postType === 'video' ? 'Record or choose a video' : 'Take or choose a photo'}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <View style={styles.mediaSourceRow}>
            <TouchableOpacity
              style={styles.mediaSourceBtn}
              onPress={() => launchMedia('camera')}
              activeOpacity={0.85}
            >
              <Ionicons name="camera-outline" size={22} color={Colors.primary} />
              <Text style={styles.mediaSourceBtnText}>
                {postType === 'video' ? 'Record' : 'Camera'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.mediaSourceBtn}
              onPress={() => launchMedia('library')}
              activeOpacity={0.85}
            >
              <Ionicons name="images-outline" size={22} color={Colors.primary} />
              <Text style={styles.mediaSourceBtnText}>Gallery</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Caption */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Caption</Text>
          <TextInput
            style={styles.captionInput}
            placeholder="Write a caption…"
            placeholderTextColor={Colors.textTertiary}
            value={caption}
            onChangeText={setCaption}
            multiline
            maxLength={500}
          />
          <Text style={styles.charCount}>{caption.length}/500</Text>
        </View>

        {/* Hashtag */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Hashtag</Text>
          <View style={styles.hashtagRow}>
            <Text style={styles.hashSign}>#</Text>
            <TextInput
              style={styles.hashtagInput}
              placeholder="addhashtag"
              placeholderTextColor={Colors.textTertiary}
              value={hashtag.replace(/^#/, '')}
              onChangeText={(v) => setHashtag(v)}
              autoCapitalize="none"
              maxLength={50}
            />
          </View>
        </View>
      </KeyboardAwareScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  postBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
  },
  postBtnDisabled: {
    opacity: 0.5,
  },
  postBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  content: {
    padding: Spacing.lg,
    gap: Spacing.xl,
  },

  typeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  typeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
  },
  typeBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  typeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  typeBtnTextActive: {
    color: '#FFFFFF',
  },

  mediaPicker: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  mediaPreviewTap: {
    width: '100%',
  },
  mediaPreview: {
    width: '100%',
    height: 280,
  },
  mediaPlaceholder: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  mediaPlaceholderText: {
    fontSize: 14,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
  mediaSourceRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  mediaSourceBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
  },
  mediaSourceBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },

  inputGroup: {
    gap: Spacing.sm,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  captionInput: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: 15,
    color: Colors.textPrimary,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 11,
    color: Colors.textTertiary,
    alignSelf: 'flex-end',
  },

  hashtagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    height: 52,
  },
  hashSign: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.primary,
    marginRight: 4,
  },
  hashtagInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.textPrimary,
  },
});
